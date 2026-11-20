import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  provideQitsNavigationTree,
  provideQitsProjectList,
  provideQitsScope,
  type QitsNavLink,
} from '@qits/ui-components';
import { routes } from './app.routes';
import { EventPage } from './event/event-page';
import { EVENT_LOOKUP_WAIT_MS, EventRedirect } from './event/event-redirect';
import { LogPage } from './log/log-page';
import { ProjectRedirect } from './project/project-redirect';
import { NAVIGATE_AWAY } from './ui/navigate-away';

/**
 * The route table, asserted where it is cheapest to get wrong: the noun repeated in `/events/:id`,
 * the same pages reachable under a project slug, the `**` catch-all sitting *inside* the chrome
 * rather than replacing it, and — since qits-2338 — the hand-off every scoped address and the bare
 * event address now attempt before anything of this application's own draws.
 *
 * These cases are about addresses and not content: each page's own spec asserts what it draws, and
 * this file asserts only that the URL reaches the right component and carries what it has to carry.
 */

/** Where the fixture navigation says `qits-landing` answers — its own host, not this one. */
const LANDING_ORIGIN = 'https://landing.qits.example';

/**
 * The navigation the chrome is handed, standing in for the edge's `/main-navigation` — the flat
 * links the sidebar draws, plus `qits-landing`'s own origin so the hand-offs below know where to
 * go. One literal tree rather than two separate providers: `provideQitsNavigationLinks` and
 * `provideQitsNavigationTree` both fill `QITS_NAVIGATION`, and the second one registered would
 * quietly win, leaving the other's links or applications unread.
 *
 * `/events/` is in the list because the last test needs a door of this application's own to find.
 */
const NAV: readonly QitsNavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Events', href: '/events/' },
];

/** The projects the chrome knows, so `/qits/…` parses as a project and not as this app's own page. */
const PROJECTS = [{ id: 'p-1', slug: 'qits', name: 'QITS' }];

const EVENT_ID = 'c5edabb5-0621-4ff8-bf1b-29a3df2bb03c';

describe('routes', () => {
  let navigateAway: ReturnType<typeof vi.fn>;
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  beforeEach(async () => {
    navigateAway = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideQitsNavigationTree({
          links: NAV,
          applications: { 'qits-landing': { origin: LANDING_ORIGIN } },
        }),
        provideQitsProjectList(PROJECTS),
        provideQitsScope('project'),
        { provide: NAVIGATE_AWAY, useValue: navigateAway },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    // No URL: a bare `create()` mounts the harness without navigating anywhere, so every guarded
    // navigation below is a `navigateByUrl` this file can flush ahead of, the same two-phase shape
    // qits-ci-frontend's `app.routes.spec.ts` uses for `handOffRun`.
    harness = await RouterTestingHarness.create();
  });

  /**
   * The component the URL activated — the whole question most of these cases ask.
   *
   * The harness hands back the component of the route it mounted, which here is always the layout;
   * the page is the leaf below it, so the snapshot is walked to the bottom. Only for an
   * **unguarded** address: nothing here flushes a request, so a guarded one would hang.
   */
  async function activated(url: string): Promise<unknown> {
    await harness.navigateByUrl(url);
    return leaf();
  }

  function leaf(): unknown {
    let route = TestBed.inject(Router).routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.component;
  }

  /**
   * The bare event form, with `handOffEvent`'s own read answered: `payload` is what
   * `GET /events/api/events/<id>` answers as the event's payload (or the read fails outright for
   * `null`). The guard holds the navigation until it has, so it is answered while it is in flight —
   * `navigateByUrl`'s own promise is left unawaited until then, the same shape
   * qits-ci-frontend's `activatedBare` uses for a bare run.
   */
  async function activatedBareEvent(payload: string | null): Promise<unknown> {
    const navigation = harness.navigateByUrl(`/events/${EVENT_ID}`);
    const request = await vi.waitFor(() =>
      http.expectOne(`/events/api/events/${EVENT_ID}`),
    );
    if (payload === null) {
      request.flush({ message: 'down' }, { status: 500, statusText: 'Down' });
    } else {
      request.flush({ event: { id: EVENT_ID, name: 'BuildSuccessful', payload } });
    }
    await navigation;
    return leaf();
  }

  it('puts the log at the root of this host', async () => {
    expect(await activated('/')).toBe(LogPage);
  });

  // `/events/<id>` is this app's own event route and not a project called `events`: the literal
  // routes are listed ahead of `:project`, and that order is the whole guard. The event here names
  // no project, so `handOffEvent` lets `EventPage` draw as it always did.
  it('addresses one event under a repeated noun, and hands it the id, when it names no project', async () => {
    expect(await activatedBareEvent('{"repoId":"qits-ci"}')).toBe(EventPage);
    expect(navigateAway).not.toHaveBeenCalled();
  });

  it('hands the project form off to the landing app’s events log instead of drawing it here', async () => {
    // Where the chrome's project picker sends this app when a reader picks `qits` — it no longer
    // stays here (qits-2338).
    expect(await activated('/qits')).toBe(ProjectRedirect);
    await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
    expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/projects/qits/events`);
  });

  it('hands the scoped event form off to the landing app’s event page instead of drawing it here', async () => {
    expect(await activated(`/qits/events/${EVENT_ID}`)).toBe(EventRedirect);
    await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
    expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/projects/qits/events/${EVENT_ID}`);
    // The scoped form reads nothing: the address already names the project.
    http.expectNone(`/events/api/events/${EVENT_ID}`);
  });

  it('encodes the project and the event id of a scoped event', async () => {
    expect(await activated('/a%20b/events/c%20d')).toBe(EventRedirect);
    await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
    expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/projects/a%20b/events/c%20d`);
  });

  it('draws an unknown URL as a 404 inside the chrome, because this host is ours', async () => {
    await harness.navigateByUrl('/no/such/page');
    const layout = harness.routeNativeElement as HTMLElement;
    expect(layout.querySelector('app-not-found')).not.toBeNull();
    // The chrome is still around it — rendering the links it was given, which here are this
    // fixture's rather than the platform's.
    expect(layout.querySelectorAll('.qits-layout-link')).toHaveLength(NAV.length);
  });

  /**
   * The bare event address, `/events/<id>`, and whether `handOffEvent` sends it to the landing
   * app's event page or lets `EventPage` draw here — the same shape of case qits-ci-frontend's
   * `handOffRun` covers for a bare run.
   */
  describe('the bare event address', () => {
    it('hands off when the payload names a project the list knows by a top-level projectId', async () => {
      await activatedBareEvent(JSON.stringify({ projectId: 'p-1' }));
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/projects/qits/events/${EVENT_ID}`);
    });

    it('hands off when the payload names a project through a nested entities[].projectId', async () => {
      await activatedBareEvent(
        JSON.stringify({ entities: [{ kind: 'repository' }, { projectId: 'p-1' }] }),
      );
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/projects/qits/events/${EVENT_ID}`);
    });

    it('serves the event here when the payload names no project', async () => {
      expect(await activatedBareEvent(JSON.stringify({ repoId: 'qits-ci' }))).toBe(EventPage);
      expect(navigateAway).not.toHaveBeenCalled();
    });

    it('serves the event here when the payload is not JSON', async () => {
      expect(await activatedBareEvent('not json at all')).toBe(EventPage);
      expect(navigateAway).not.toHaveBeenCalled();
    });

    it('serves the event here when the payload names a project no listed project carries', async () => {
      expect(await activatedBareEvent(JSON.stringify({ projectId: 'gone' }))).toBe(EventPage);
      expect(navigateAway).not.toHaveBeenCalled();
    });

    it('serves the event here when the event read fails', async () => {
      expect(await activatedBareEvent(null)).toBe(EventPage);
      expect(navigateAway).not.toHaveBeenCalled();
    });

    it('serves the event here rather than wait past its bound on a lookup that never answers', async () => {
      vi.useFakeTimers();
      try {
        const navigation = harness.navigateByUrl(`/events/${EVENT_ID}`);
        await vi.advanceTimersByTimeAsync(0);
        http.expectOne(`/events/api/events/${EVENT_ID}`);
        await vi.advanceTimersByTimeAsync(EVENT_LOOKUP_WAIT_MS);
        await navigation;

        expect(leaf()).toBe(EventPage);
        expect(navigateAway).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
