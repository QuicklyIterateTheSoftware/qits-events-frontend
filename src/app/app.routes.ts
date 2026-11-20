import type { Route, Routes } from '@angular/router';
import { QitsMainLayout } from '@qits/ui-components';
import { EventPage } from './event/event-page';
import { EventRedirect, handOffEvent } from './event/event-redirect';
import { LogPage } from './log/log-page';
import { NotFound } from './not-found/not-found';
import { ProjectRedirect } from './project/project-redirect';

/**
 * This application's own two pages, reachable at the root.
 *
 * **The event page repeats the noun, and that is the decision rather than an oversight.**
 * `/events/:id` — a bare id at the root — reads better, swallows every future top-level route and
 * makes `**` unreachable, and it cannot be undone once a link is shared. Every sibling repeats its
 * noun (`/runs/…`, `/repositories/…`) and this segment matches the API path it mirrors.
 *
 * **Every level that costs a request is URL state.** Here the split is by kind: the event is its
 * own page because it is its own fetch and its own walk, while the log's four filters — name,
 * since, payload search, cursor — are *query parameters*, because they narrow one screen rather
 * than enter a level. Both halves are bookmarkable, and the back button means "undo the filter" on
 * one and "leave the event" on the other.
 *
 * **The bare event hands off when it can** (qits-2338): the landing app has its own page for an
 * event, `/projects/<slug>/events/<id>`, and {@link handOffEvent} sends the bare address there once
 * the event and the project list say which slug that is. When they cannot say — an event naming no
 * project, a project nobody lists, a read that fails or is slow — the guard lets `EventPage` draw
 * here, exactly as it always did. The log's own bare address, `''`, never hands off: it is the
 * unscoped log, which has no project to send it to and stays this application's own page.
 *
 * Both pages load eagerly. There are two of them, they share every component below them, and a lazy
 * chunk boundary would be ceremony that costs a round trip.
 */
const OWN: Routes = [
  { path: '', component: LogPage },
  { path: 'events/:id', component: EventPage, canActivate: [handOffEvent] },
];

/**
 * The project-scoped forms of the two pages above — `/<slug>` and `/<slug>/events/<id>` — neither of
 * which draws either page here any more (qits-2338). Both used to scope `LogPage`/`EventPage` to a
 * project with no read of their own, the same component serving the bare and the scoped address
 * alike; the log and the event page now live in qits-landing-app instead, at
 * `/projects/<slug>/events` and `/projects/<slug>/events/<id>`, and `ProjectRedirect` and
 * `EventRedirect` are this application's only job at these two addresses: a full-document hand-off
 * through `NAVIGATE_AWAY`, never the router, because the destination is a different Angular
 * application and a `routerLink` would compile and go nowhere.
 *
 * **Order is the whole guard.** The literal routes above are matched first, so `/events` stays this
 * app's own event route and never reads as a project called `events`; only what none of them claim
 * falls through to `:project`. A page never reads these parameters directly — `ProjectRedirect` and
 * `EventRedirect` read `ActivatedRoute` once, in their own constructor, and nothing downstream of
 * them needs to.
 *
 * This app is project scoped and not repository scoped: the log is the platform's, and a project
 * narrows it rather than dividing it, so there is no `/<slug>/<category>/<repo>/` address here —
 * same as before qits-2338, which only moved where the two addresses draw, not how deep they go.
 */
const SCOPED: Route = {
  path: ':project',
  children: [
    { path: '', component: ProjectRedirect },
    { path: 'events/:id', component: EventRedirect },
  ],
};

/**
 * The `**` route sits inside the layout: this application is served at the root of its own host, so
 * an unknown URL is an ordinary 404 and is drawn with the chrome around it. `/events/api` and
 * `/events/stream` never reach it — the service claims both ahead of the SPA.
 */
export const routes: Routes = [
  {
    path: '',
    component: QitsMainLayout,
    children: [...OWN, SCOPED, { path: '**', component: NotFound }],
  },
];
