// Vibration feedback. In the Android app this uses the phone's haptic engine
// (crisp taps on the Pixel); in the browser it falls back to navigator.vibrate.
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

export class Haptic {
  constructor(store) {
    this.store = store;
    this.on = store.get('haptics', true);
    this.last = 0;
  }
  set(on) { this.on = on; this.store.set('haptics', on); if (on) this.impact('medium'); }

  // `minGap` keeps rapid events (chips, lanes) from turning into a constant buzz
  impact(style = 'light', minGap = 0) {
    if (!this.on) return;
    const now = performance.now();
    if (now - this.last < minGap) return;
    this.last = now;
    if (native) Haptics.impact({ style: { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }[style] }).catch(() => {});
    else if (navigator.vibrate) navigator.vibrate({ light: 12, medium: 25, heavy: 45 }[style]);
  }
  pattern(ms) {
    if (!this.on) return;
    if (native) {
      // a short sequence of heavy hits approximates the pattern
      let t = 0;
      ms.forEach((d, i) => { if (i % 2 === 0) setTimeout(() => Haptics.impact({ style: d > 50 ? ImpactStyle.Heavy : ImpactStyle.Medium }).catch(() => {}), t); t += d; });
    } else if (navigator.vibrate) navigator.vibrate(ms);
  }
  success() {
    if (!this.on) return;
    if (native) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    else if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
  }

  play(ev) {
    switch (ev.type) {
      case 'jump': this.impact('light'); break;
      case 'land': this.impact('light', 120); break;
      case 'slide': this.impact('light'); break;
      case 'lane': this.impact('light', 60); break;
      case 'turn': this.impact('medium'); break;
      case 'chip': if (ev.combo % 10 === 0) this.impact('medium'); else this.impact('light', 90); break;
      case 'stumble': this.pattern([50, 30, 50]); break;
      case 'smash': this.impact('heavy'); break;
      case 'power': this.success(); break;
      case 'rideStart': case 'rideEnd': this.impact('medium'); break;
      case 'crash': this.pattern([80, 40, 140]); break;
      case 'revive': this.success(); break;
      case 'event': this.pattern([30, 60, 30, 60, 30]); break;
      case 'doorOpen': this.impact('light'); break;
    }
  }
}
