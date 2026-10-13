// Finding the map center can accept an approximate fix; run recording still
// requests precise, fresh fixes through its own geolocation watch.
export async function locatePosition(geolocation, secure = true) {
  if (!secure) throw Object.assign(new Error('Location requires an HTTPS connection.'), { code: 'insecure' });
  if (!geolocation) throw Object.assign(new Error('Location is not supported by this browser.'), { code: 'unsupported' });
  const request = options => new Promise((resolve, reject) => geolocation.getCurrentPosition(resolve, reject, options));
  try {
    return await request({ enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  } catch (error) {
    if (error.code === 1) throw error;
    return await request({ enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
  }
}
export function locationErrorMessage(error) {
  if (error.code === 1) return 'Location access is blocked. Allow location for this website and for your browser in your device settings, then retry.';
  if (error.code === 3) return 'Finding your location timed out. Check Location Services and your connection, then retry. On a phone, try outdoors.';
  if (error.code === 'insecure') return 'Location needs HTTPS. Open https://iquarter11.github.io/trail-runner/ in Safari or Chrome.';
  if (error.code === 'unsupported') return 'This browser does not provide location. Open the app in Safari or Chrome.';
  return 'Your browser or device could not provide a location. Check Location Services. If you are using an in-app browser, try the same link in Safari or Chrome.';
}
