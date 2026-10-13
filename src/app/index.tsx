import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { Coordinate, fetchRoute, miles, PlannedRoute } from '../lib/routes';
import { deleteRoute, listRoutes, saveRoute } from '../lib/storage';

const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
if (token) Mapbox.setAccessToken(token);
type Preview = Omit<PlannedRoute, 'id' | 'name' | 'createdAt'>;
export default function Planner() {
  const [tab, setTab] = useState<'plan' | 'saved'>('plan');
  const [points, setPoints] = useState<Coordinate[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saved, setSaved] = useState<PlannedRoute[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const camera = useRef<ComponentRef<typeof Mapbox.Camera>>(null);
  const request = useRef<AbortController | null>(null);
  const saveLock = useRef(false);
  useEffect(() => {
    listRoutes().then(routes => { setSaved(routes); setStorageReady(true); }).catch(() => setError('Could not load saved routes. Restart the app to try again.'));
    return () => request.current?.abort();
  }, []);
  function updatePoints(next: Coordinate[]) {
    request.current?.abort();
    request.current = null;
    setBusy(false); setPoints(next); setPreview(null); setError('');
  }
  async function generate() {
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setBusy(true); setError('');
    try {
      const result = await fetchRoute(points, token, controller.signal);
      if (request.current === controller) setPreview(result);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not create route.');
    } finally { if (request.current === controller) setBusy(false); }
  }
  async function locate() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setError('Location permission is off. You can still pan the map and plan manually.'); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      camera.current?.setCamera({ centerCoordinate: [position.coords.longitude, position.coords.latitude], zoomLevel: 14, animationDuration: 800 });
      setError('');
    } catch { setError('Could not find your location. Try again outdoors or pan the map manually.'); }
  }
  async function persist() {
    if (!preview || !name.trim() || !storageReady || saveLock.current) return;
    saveLock.current = true; setSaving(true);
    const route: PlannedRoute = { ...preview, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: name.trim(), createdAt: new Date().toISOString() };
    try { await saveRoute(route); setSaved(current => [route, ...current]); setName(''); setTab('saved'); }
    catch { setError('Could not save this route. Please try again.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  function openRoute(route: PlannedRoute) {
    updatePoints(route.waypoints); setPreview(route); setName(route.name); setTab('plan');
    const lng = route.geometry.coordinates.map(p => p[0]); const lat = route.geometry.coordinates.map(p => p[1]);
    camera.current?.fitBounds([Math.max(...lng), Math.max(...lat)], [Math.min(...lng), Math.min(...lat)], 50, 800);
  }
  function remove(route: PlannedRoute) {
    Alert.alert('Delete route?', route.name, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => {
      deleteRoute(route.id).then(() => setSaved(current => current.filter(item => item.id !== route.id))).catch(() => setError('Could not delete the route.'));
    } }]);
  }
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}><Text style={styles.eyebrow}>MAKE ROOM FOR THE OUTDOORS</Text><Text style={styles.title}>Trail Runner</Text><Text style={styles.subtitle}>Your next run starts with a route.</Text></View>
    <View style={styles.tabs}>{(['plan', 'saved'] as const).map(item => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.activeTab]}><Text style={[styles.tabText, tab === item && styles.activeText]}>{item === 'plan' ? 'Plan a route' : `Saved routes · ${saved.length}`}</Text></Pressable>)}</View>
    <View style={[styles.map, tab === 'saved' && styles.hidden]}>
      {token ? <Mapbox.MapView style={styles.fill} styleURL={Mapbox.StyleURL.Outdoors} onPress={event => {
        if (event.geometry.type !== 'Point') return;
        if (points.length >= 25) { setError('A route can have up to 25 points. Undo a point to add another.'); return; }
        updatePoints([...points, event.geometry.coordinates.slice(0, 2) as Coordinate]);
      }}>
        <Mapbox.Camera ref={camera} defaultSettings={{ centerCoordinate: [-73.97, 40.78], zoomLevel: 12 }} />
        {preview && <Mapbox.ShapeSource id="route" shape={{ type: 'Feature', properties: {}, geometry: preview.geometry }}><Mapbox.LineLayer id="route-line" style={{ lineColor: '#17694b', lineWidth: 5, lineCap: 'round', lineJoin: 'round' }} /></Mapbox.ShapeSource>}
        {points.length > 0 && <Mapbox.ShapeSource id="waypoints" shape={{ type: 'FeatureCollection', features: points.map((coordinates, index) => ({ type: 'Feature', properties: { label: String(index + 1) }, geometry: { type: 'Point', coordinates } })) }}><Mapbox.CircleLayer id="point-circles" style={{ circleColor: '#fff', circleRadius: 12, circleStrokeColor: '#17694b', circleStrokeWidth: 3 }} /><Mapbox.SymbolLayer id="point-labels" style={{ textField: ['get', 'label'], textSize: 12, textColor: '#17694b', textAllowOverlap: true }} /></Mapbox.ShapeSource>}
      </Mapbox.MapView> : <View style={styles.setup}><Text style={styles.cardTitle}>Connect your map</Text><Text style={styles.body}>Add your public Mapbox token to .env.local, then restart Expo. The README walks you through the setup.</Text></View>}
      {token && <Pressable accessibilityLabel="Center map on my location" style={styles.locate} onPress={locate}><Text style={styles.tabText}>Find me</Text></Pressable>}
    </View>
    {tab === 'plan' ? <ScrollView style={styles.panel} keyboardShouldPersistTaps="handled"><Text style={styles.cardTitle}>{preview ? 'Your route is ready' : 'Find your way'}</Text><Text style={styles.body}>Tap the map to add your start, shaping points, and finish. Walking routes follow available mapped paths and roads.</Text>
      <View style={styles.stats}><View><Text style={styles.stat}>{preview ? miles(preview.distanceMeters) : '—'}</Text><Text style={styles.label}>MILES</Text></View><View><Text style={styles.stat}>{points.length}</Text><Text style={styles.label}>POINTS / 25</Text></View><View><Text style={styles.stat}>—</Text><Text style={styles.label}>ELEVATION GAIN</Text></View></View>
      <Text style={styles.note}>Elevation preview is coming in a later build.</Text>
      <View style={styles.actions}><Button label="Undo point" disabled={!points.length || saving} onPress={() => updatePoints(points.slice(0, -1))} secondary /><Button label="Clear" disabled={!points.length || saving} onPress={() => { updatePoints([]); setName(''); }} secondary /></View>
      <Button label={busy ? 'Finding paths…' : 'Preview walking route'} disabled={!token || points.length < 2 || busy || saving} onPress={generate} />
      {preview && <View style={styles.save}><TextInput accessibilityLabel="Route name" placeholder="Name your route" value={name} maxLength={80} onChangeText={setName} style={styles.input} /><Button label={saving ? 'Saving…' : 'Save route'} disabled={!name.trim() || saving || !storageReady} onPress={persist} /><Text style={styles.note}>{preview.instructions.length} guidance steps saved for future live navigation.</Text></View>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}<View style={styles.bottom} />
    </ScrollView> : <ScrollView style={styles.library}><Text style={styles.cardTitle}>Ready when you are</Text><Text style={styles.body}>Routes saved on this phone.</Text>{!saved.length && <View style={styles.empty}><Text style={styles.cardTitle}>Start with your first route</Text><Text style={styles.body}>Plan a route, give it a name, and save it here.</Text><Button label="Plan a route" onPress={() => setTab('plan')} /></View>}{saved.map(route => <View key={route.id} style={styles.routeCard}><Text style={styles.cardTitle}>{route.name}</Text><Text style={styles.body}>{miles(route.distanceMeters)} mi · {route.waypoints.length} points · {new Date(route.createdAt).toLocaleDateString()}</Text><View style={styles.actions}><Button label="View route" onPress={() => openRoute(route)} /><Button label="Delete" onPress={() => remove(route)} secondary /></View></View>)}{!!error && <Text style={styles.error}>{error}</Text>}</ScrollView>}
  </SafeAreaView>;
}
function Button({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f5ee' }, header: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 18 }, eyebrow: { color: '#17694b', fontSize: 10, fontWeight: '700', letterSpacing: 1.7 }, title: { fontSize: 34, fontWeight: '800', color: '#17392b', marginTop: 5 }, subtitle: { color: '#637166', marginTop: 4 }, tabs: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#e8eadf', borderRadius: 12, padding: 4, marginBottom: 16 }, tab: { flex: 1, padding: 12, borderRadius: 9, alignItems: 'center' }, activeTab: { backgroundColor: '#17694b' }, tabText: { color: '#17694b', fontWeight: '700' }, activeText: { color: '#fff' }, map: { flex: 1, minHeight: 180, marginHorizontal: 16, borderRadius: 20, overflow: 'hidden', backgroundColor: '#e4e9dc' }, hidden: { display: 'none' }, fill: { flex: 1 }, setup: { padding: 24, flex: 1, justifyContent: 'center' }, locate: { position: 'absolute', right: 12, top: 12, backgroundColor: '#fff', padding: 12, borderRadius: 10 }, panel: { flexGrow: 0, maxHeight: '48%', paddingHorizontal: 22, paddingTop: 18 }, cardTitle: { color: '#17392b', fontSize: 20, fontWeight: '700' }, body: { color: '#637166', lineHeight: 21, marginTop: 7 }, stats: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 18 }, stat: { color: '#17392b', fontSize: 28, fontWeight: '700' }, label: { color: '#637166', fontSize: 9, fontWeight: '700', marginTop: 4 }, note: { color: '#637166', fontSize: 12, marginBottom: 12, marginTop: 5 }, actions: { flexDirection: 'row', gap: 10, marginVertical: 10 }, button: { backgroundColor: '#17694b', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '700' }, secondary: { backgroundColor: '#e8eadf' }, secondaryText: { color: '#17694b' }, disabled: { opacity: 0.4 }, save: { marginTop: 16 }, input: { borderColor: '#cbd3c6', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10, backgroundColor: '#fff', color: '#17392b' }, error: { color: '#a63322', lineHeight: 20, marginVertical: 12 }, bottom: { height: 30 }, library: { flex: 1, paddingHorizontal: 22 }, empty: { paddingVertical: 30, gap: 12 }, routeCard: { backgroundColor: '#fff', padding: 18, borderRadius: 16, marginTop: 16 },
});
