import { provideBrowserGlobalErrorListeners, type ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideQitsBearerSignIn, qitsBearerInterceptor } from '@qits/angular';
import {
  provideQitsBuilds,
  provideQitsNavigation,
  provideQitsProjects,
  provideQitsScope,
} from '@qits/ui-components';

import { routes } from './app.routes';

/**
 * Nine providers, in the order every sibling repeats.
 *
 * - `provideBrowserGlobalErrorListeners` funnels genuinely-global errors and unhandled rejections
 *   into Angular's `ErrorHandler`.
 * - `provideRouter` carries this app's state: the event is a path segment and the log's filters are
 *   query parameters, so the URL is what makes both bookmarkable.
 * - `provideQitsBearerSignIn({ clientId: 'qits-spa' })` signs this page in with the idp's public PKCE
 *   client and puts `/auth/callback` in front of the app's own routes (epic qits-543). `withFetch`
 *   is not a preference. The default XHR backend is invisible to OTLP fetch instrumentation, so
 *   choosing it would quietly forfeit client spans the moment this deployment grows a telemetry
 *   relay, and it is also what `qitsBearerInterceptor` needs to attach the bearer. Every call this
 *   app makes is a same-origin path behind the edge — this service authenticates nothing of its
 *   own, but every page signs in the same way, and the socket upgrade now offers the bearer as the
 *   `qits.bearer` subprotocol rather than answering `101` with no credential at all.
 * - `provideQitsNavigation` is what puts links in the shared layout's sidebar. It issues one `GET
 *   /main-navigation` at startup and hands the answer to `QitsMainLayout`: the platform's door list
 *   is the edge's answer now, derived from the deployments it actually serves, rather than a list
 *   compiled into `@qits/ui-components` that lagged every new application. It needs the
 *   `provideHttpClient` above, and without it the sidebar renders empty.
 * - `provideQitsProjects` fills the chrome's project picker from one `GET /projects/api/projects`,
 *   and installs the repositories of whatever project is in scope alongside it.
 * - `provideQitsScope('project')` says how deep this application's own addresses go. Every page
 *   here is about the platform's event log, which one project narrows but does not divide, so the
 *   deepest address this app serves is `/<projectSlug>/…` — never the repository form. The scope is
 *   read from the address and nothing else, so picking a project navigates rather than remembers.
 * - `provideQitsBuilds` puts the pending-builds bolt beside the picker: a popover of what qits-ci is
 *   building right now, from `GET /ci/api/runs/active`. Same-origin like every other read here — the
 *   edge routes `/ci` on every vhost — so it needs the `provideHttpClient` above and names no origin
 *   of its own. Providing it is what puts the bolt there, exactly as no project source means no
 *   picker. Closed, it asks nothing at all; it polls only while a reader keeps the panel open.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideQitsBearerSignIn({ clientId: 'qits-spa' }),
    provideHttpClient(withFetch(), withInterceptors([qitsBearerInterceptor])),
    provideQitsNavigation(),
    provideQitsProjects(),
    provideQitsScope('project'),
    provideQitsBuilds(),
  ],
};
