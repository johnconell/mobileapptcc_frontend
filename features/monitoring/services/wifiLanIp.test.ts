import assert from 'node:assert/strict';
import test from 'node:test';
import { selectReachableLanIp } from './wifiLanIp';

test('keeps the Wi-Fi LAN address when mobile data becomes the primary route', () => {
  assert.equal(
    selectReachableLanIp({
      detailIp: null,
      genericIp: '10.24.8.9',
      nativeAndroidIp: '192.168.1.42',
      isWifi: false,
      isAndroid: true,
    }),
    '192.168.1.42',
  );
});

test('accepts an Android hotspot interface but rejects cellular-only private addresses', () => {
  assert.equal(
    selectReachableLanIp({
      nativeAndroidIp: '192.168.43.1',
      genericIp: '10.70.1.8',
      isWifi: false,
      isAndroid: true,
    }),
    '192.168.43.1',
  );
  assert.equal(
    selectReachableLanIp({
      nativeAndroidIp: null,
      genericIp: '10.70.1.8',
      isWifi: false,
      isAndroid: true,
    }),
    null,
  );
});

test('prefers the current Wi-Fi detail address after DHCP or interface changes', () => {
  assert.equal(
    selectReachableLanIp({
      detailIp: '192.168.105.22',
      genericIp: '10.0.0.7',
      nativeAndroidIp: '192.168.105.22',
      isWifi: true,
      isAndroid: true,
    }),
    '192.168.105.22',
  );
});
