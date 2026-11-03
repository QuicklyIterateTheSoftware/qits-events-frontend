import { HttpBackend, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QITS_SIGN_IN, QITS_WEB_SOCKET, QitsTokens } from '@qits/angular';
import { firstValueFrom } from 'rxjs';
import { appConfig } from './app.config';
import { WEB_SOCKET_FACTORY } from './api/web-socket';

/**
 * The backend choice is invisible when it is wrong: the XHR one works perfectly and simply produces
 * client spans that never exist. So it is asserted here rather than discovered as a telemetry gap,
 * the same way spa-home, spa-ci, spa-cd and spa-artifacts assert their own wiring.
 */
describe('appConfig', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
  });

  it('provides an HttpClient on the fetch backend', () => {
    expect(TestBed.inject(HttpClient)).toBeTruthy();
    expect(TestBed.inject(HttpBackend).constructor.name).toContain('Fetch');
  });

  it('signs in with the qits-spa client', () => {
    expect(TestBed.inject(QITS_SIGN_IN).clientId).toBe('qits-spa');
  });

  it('opens the live-tail socket through the bearer sign-in', () => {
    expect(TestBed.inject(WEB_SOCKET_FACTORY)).toBe(TestBed.inject(QITS_WEB_SOCKET));
  });

  /**
   * The cheap equivalent of asserting `withInterceptors([qitsBearerInterceptor])` is wired: a call
   * through the configured `HttpClient` to this app's own origin (always a platform URL,
   * `isPlatformUrl`'s same-origin branch) carries the bearer `QitsTokens` hands out.
   */
  it('puts the bearer on its own calls', async () => {
    const tokens = { accessToken: async () => 'A1' };
    TestBed.overrideProvider(QitsTokens, { useValue: tokens });
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });

    const client = TestBed.inject(HttpClient);
    const http = TestBed.inject(HttpTestingController);
    const answer = firstValueFrom(client.get('/events/api/events'));
    await Promise.resolve();
    const request = http.expectOne('/events/api/events');
    expect(request.request.headers.get('authorization')).toBe('Bearer A1');
    request.flush({ events: [] });
    await answer;
  });
});
