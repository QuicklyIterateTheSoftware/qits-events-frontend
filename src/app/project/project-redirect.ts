import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { QitsAppLinks } from '@qits/ui-components';
import { NAVIGATE_AWAY } from '../ui/navigate-away';
import { landingOrigin } from './landing-origin';

/**
 * The bare project address, `/<slug>` — the `''` child of `:project`.
 *
 * It draws nothing of its own. `/<slug>` used to open this application's log scoped to that
 * project; qits-2338 hands that page to the landing app instead, whose own address for it is
 * `/projects/<slug>/events` — so this component's only job is a full-document hand-off,
 * `<landing origin>/projects/<slug>/events`, through {@link NAVIGATE_AWAY} rather than the router:
 * the destination is a different Angular application, and a `routerLink` would compile and go
 * nowhere.
 *
 * Copied from qits-ci-frontend's `ProjectRedirect`, which hands the same shape of address off to
 * its own scoped page (`/projects/<slug>/ci`).
 */
@Component({
  selector: 'app-project-redirect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class ProjectRedirect {
  constructor() {
    const slug = inject(ActivatedRoute).snapshot.parent?.paramMap.get('project') ?? '';
    const links = inject(QitsAppLinks);
    const navigateAway = inject(NAVIGATE_AWAY);
    void landingOrigin(links).then((origin) => {
      navigateAway(`${origin.replace(/\/+$/, '')}/projects/${encodeURIComponent(slug)}/events`);
    });
  }
}
