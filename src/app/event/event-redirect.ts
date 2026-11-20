import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type CanActivateFn } from '@angular/router';
import {
  QITS_PROJECTS,
  QitsAppLinks,
  type QitsProject,
  type QitsProjectsSource,
} from '@qits/ui-components';
import { filter, firstValueFrom } from 'rxjs';
import { EventsApi } from '../api/events-api';
import { landingOrigin } from '../project/landing-origin';
import { NAVIGATE_AWAY } from '../ui/navigate-away';

/**
 * How long the bare event address, `/events/<id>`, waits to learn which project the event belongs
 * to before giving up on handing it off and drawing `EventPage` here instead.
 *
 * The scoped form never waits on this: its address already names the project. The bare one has to
 * read the event and the project list first, and a reader who opened a bookmark must not stare at
 * a blank page because either read is slow — past this bound the old page is the answer.
 *
 * Copied from qits-ci-frontend's `RUN_LOOKUP_WAIT_MS` (`run-redirect.ts`), which bounds the same
 * kind of lookup for a bare run address.
 */
export const EVENT_LOOKUP_WAIT_MS = 3000;

/** `<landing origin>/projects/<project>/events/<id>`, every segment encoded. */
function landingEventAddress(origin: string, project: string, id: string): string {
  return `${origin.replace(/\/+$/, '')}/projects/${encodeURIComponent(project)}/events/${encodeURIComponent(id)}`;
}

/**
 * The `projectId` an event's payload names, or null when it names none.
 *
 * The payload is a string the service never looks inside, so a value here may be anything a
 * publisher sent and may not be JSON at all. Two shapes carry a project: a top-level `projectId`
 * (every `SCMRelease` and `SoftwareRelease` on the live store), and, for a wider event describing
 * several things at once, `entities[].projectId` — the first entity that names one wins. Anything
 * else — no JSON, no object, a `projectId` that is not a non-empty string, an `entities` that is
 * not an array — answers null, the same reading a hand-recorded probe with no project gets.
 */
export function projectIdFromPayload(payload: string | null): string | null {
  if (!payload) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const top = record['projectId'];
  if (typeof top === 'string' && top.length > 0) {
    return top;
  }
  const entities = record['entities'];
  if (Array.isArray(entities)) {
    for (const entity of entities) {
      if (typeof entity !== 'object' || entity === null) {
        continue;
      }
      const id = (entity as Record<string, unknown>)['projectId'];
      if (typeof id === 'string' && id.length > 0) {
        return id;
      }
    }
  }
  return null;
}

/**
 * {@link QitsProjectsSource.projects}, once it has answered — immediately when it already has, and
 * the moment it does otherwise. A source that gave up on its own read still resolves: `QITS_PROJECTS`
 * answers a failed list as `[]` rather than leaving `projects()` undefined forever, so this never
 * hangs on a failure by itself — only {@link handOffEvent}'s own bound protects against a source
 * that is merely slow.
 */
function whenProjects(
  source: QitsProjectsSource,
  injector: Injector,
): Promise<readonly QitsProject[]> {
  const immediate = source.projects();
  if (immediate !== undefined) {
    return Promise.resolve(immediate);
  }
  return firstValueFrom(
    toObservable(source.projects, { injector }).pipe(
      filter((list): list is readonly QitsProject[] => list !== undefined),
    ),
  );
}

/**
 * An event under a project, `/<project>/events/<id>` — the `events/:id` child of the scoped form.
 *
 * It draws nothing of its own. The address used to draw `EventPage` here; qits-2338 hands the event
 * to the landing app instead, whose own address for it is `/projects/<project>/events/<id>` — so
 * this component's only job is a full-document hand-off through {@link NAVIGATE_AWAY}, on the same
 * terms as `ProjectRedirect` and qits-ci-frontend's `RunRedirect`.
 *
 * The address already names the project, so no read is made: `id` is this route's own param,
 * `project` its parent's.
 */
@Component({
  selector: 'app-event-redirect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class EventRedirect {
  constructor() {
    const snapshot = inject(ActivatedRoute).snapshot;
    const id = snapshot.paramMap.get('id') ?? '';
    const project = snapshot.parent?.paramMap.get('project') ?? '';
    const links = inject(QitsAppLinks);
    const navigateAway = inject(NAVIGATE_AWAY);
    void landingOrigin(links).then((origin) => {
      navigateAway(landingEventAddress(origin, project, id));
    });
  }
}

/**
 * The bare event address, `/events/<id>`, handed off to the landing app when the event names a
 * project this platform knows — and left to `EventPage` here when it does not.
 *
 * Unlike the scoped form the address carries no slug, so it is read: the event first
 * ({@link projectIdFromPayload} of its payload), then — only when it names one — the project list,
 * to turn that id into the slug landing's address is spelled with. Either read failing, an event
 * that names no project (a hand-recorded probe, a row older than any project-carrying payload), a
 * project id no listed project carries, or the whole lookup outlasting
 * {@link EVENT_LOOKUP_WAIT_MS}: each of those activates the route as it always did, so a bookmark
 * always lands somewhere.
 *
 * A guard rather than a wrapper component, so the fallback *is* `EventPage` on its own route and
 * nothing about that page's layout or reading of the route changes. The cost is that the fallback
 * reads the event a second time; a bounded lookup that runs once per opened address does not earn a
 * cache shared with the page. Modelled on qits-ci-frontend's `handOffRun`.
 */
export const handOffEvent: CanActivateFn = async (route) => {
  const api = inject(EventsApi);
  const source = inject(QITS_PROJECTS, { optional: true });
  const injector = inject(Injector);
  const links = inject(QitsAppLinks);
  const navigateAway = inject(NAVIGATE_AWAY);
  const id = route.paramMap.get('id') ?? '';

  const lookup = (async (): Promise<string | null> => {
    const event = await api.get(id);
    const projectId = projectIdFromPayload(event.payload);
    if (!projectId || !source) {
      return null;
    }
    const projects = await whenProjects(source, injector);
    return projects.find((project) => project.id === projectId)?.slug ?? null;
  })().catch(() => null);
  const bound = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), EVENT_LOOKUP_WAIT_MS);
  });

  const slug = await Promise.race([lookup, bound]);
  if (slug === null) {
    return true;
  }
  navigateAway(landingEventAddress(await landingOrigin(links), slug, id));
  return false;
};
