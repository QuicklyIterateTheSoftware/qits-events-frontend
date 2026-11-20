import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { provideQitsNavigationTree } from '@qits/ui-components';
import { NAVIGATE_AWAY } from '../ui/navigate-away';
import { EventRedirect, projectIdFromPayload } from './event-redirect';

/**
 * What {@link handOffEvent} reads a project id from: the two shapes the live store carries, and
 * every way a payload can name neither.
 *
 * `handOffEvent` itself is tested at the address level, in `app.routes.spec.ts`, the way
 * qits-ci-frontend's `handOffRun` is — this is the pure extraction underneath it, where the
 * payload's many honest failure shapes (not JSON, an array, a non-string id) are cheapest to cover.
 */
describe('projectIdFromPayload', () => {
  it('reads a top-level projectId', () => {
    expect(projectIdFromPayload(JSON.stringify({ projectId: 'p1', branch: 'main' }))).toBe('p1');
  });

  it('reads the first entity that names a projectId when there is no top-level one', () => {
    const payload = JSON.stringify({
      entities: [{ kind: 'repository' }, { kind: 'project', projectId: 'p1' }, { projectId: 'p2' }],
    });
    expect(projectIdFromPayload(payload)).toBe('p1');
  });

  it('prefers the top-level projectId over an entity carrying a different one', () => {
    const payload = JSON.stringify({ projectId: 'p1', entities: [{ projectId: 'p2' }] });
    expect(projectIdFromPayload(payload)).toBe('p1');
  });

  it('names no project for a payload with neither shape', () => {
    expect(projectIdFromPayload(JSON.stringify({ branch: 'main' }))).toBeNull();
  });

  it('names no project for an entities array with no projectId on any entry', () => {
    expect(projectIdFromPayload(JSON.stringify({ entities: [{ kind: 'repository' }] }))).toBeNull();
  });

  it('names no project for null, empty and whitespace-only payloads', () => {
    expect(projectIdFromPayload(null)).toBeNull();
    expect(projectIdFromPayload('')).toBeNull();
  });

  it('names no project for a payload that is not JSON', () => {
    expect(projectIdFromPayload('not json at all')).toBeNull();
  });

  it('names no project for valid JSON that is not an object', () => {
    expect(projectIdFromPayload('42')).toBeNull();
    expect(projectIdFromPayload('[1,2,3]')).toBeNull();
    expect(projectIdFromPayload('null')).toBeNull();
  });

  it('ignores a projectId that is not a string, or is empty', () => {
    expect(projectIdFromPayload(JSON.stringify({ projectId: 42 }))).toBeNull();
    expect(projectIdFromPayload(JSON.stringify({ projectId: '' }))).toBeNull();
  });
});

/**
 * Where `/<project>/events/<id>` sends a reader, in isolation from the routes that decide it gets
 * here at all — `app.routes.spec.ts` covers that the address and nothing else reaches this
 * component, and that `handOffEvent` lands here for the bare address once it can name a project.
 *
 * `ActivatedRoute` is stubbed rather than routed to: this component reads only its own `id` param
 * and its parent's `project` param, so a bare snapshot carrying both is the whole fixture, and
 * nothing here needs a router or a mounted layout.
 *
 * The origin resolution itself — `qits-landing`'s own origin, the environment's, a relative path,
 * and the bound on all three — is shared with `ProjectRedirect` (`landing-origin.ts`) and is
 * `project-redirect.spec.ts`'s to cover in full; this file repeats one case to prove this component
 * asks for the right path on top of it.
 */
describe('EventRedirect', () => {
  const ID = 'c5edabb5-0621-4ff8-bf1b-29a3df2bb03c';

  function configure(
    project: string,
    id: string,
    ...providers: unknown[]
  ): { navigateAway: (url: string) => void } {
    const navigateAway = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id }),
              parent: { paramMap: convertToParamMap({ project }) },
            },
          },
        },
        { provide: NAVIGATE_AWAY, useValue: navigateAway },
        ...providers,
      ],
    });
    return { navigateAway };
  }

  it('hands the reader to the landing app’s event page for the project, once the navigation names it', async () => {
    const { navigateAway } = configure(
      'qits',
      ID,
      provideQitsNavigationTree({ applications: { 'qits-landing': { origin: 'https://landing.qits.example' } } }),
    );
    TestBed.createComponent(EventRedirect);
    await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
    expect(navigateAway).toHaveBeenCalledWith(`https://landing.qits.example/projects/qits/events/${ID}`);
  });

  it('encodes the project and the event id', async () => {
    const { navigateAway } = configure(
      'a b',
      'c d',
      provideQitsNavigationTree({ applications: { 'qits-landing': { origin: 'https://landing.qits.example' } } }),
    );
    TestBed.createComponent(EventRedirect);
    await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
    expect(navigateAway).toHaveBeenCalledWith('https://landing.qits.example/projects/a%20b/events/c%20d');
  });

  it('falls back to a relative path with no navigation at all, same-origin like every other read before it', async () => {
    const { navigateAway } = configure('qits', ID);
    TestBed.createComponent(EventRedirect);
    await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
    expect(navigateAway).toHaveBeenCalledWith(`/projects/qits/events/${ID}`);
  });
});
