import { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FilterForm from '../components/FilterForm';
import EventCard from '../components/EventCard';
import EventDetailsModal from '../components/EventDetailsModal';
import { collectEvents } from '../lib/collect-events';
import { filterEvents } from '../lib/filter-events';

// Cache key for the convenience "show last results on cold start" cache —
// this is a per-device browser/WebView-style cache (AsyncStorage), not the
// events.json-on-disk artifact that was explicitly ruled out for this
// module: nothing here is a data file the project manages or ships.
const CACHE_KEY = 'rikiki:last-collection';

export default function SearchScreen() {
  const [store, setStore] = useState({ generatedAt: null, sources: [], events: [] });
  const [results, setResults] = useState([]);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const lastQuery = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (raw) setStore(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  async function runSearch(query) {
    setCollecting(true);
    setError('');
    lastQuery.current = query;
    try {
      const collected = await collectEvents();
      setStore(collected);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(collected)).catch(() => {});
      applyFilters(collected, query);
    } catch (e) {
      setError(`Falha ao recolher eventos: ${e.message || e}`);
    } finally {
      setCollecting(false);
    }
  }

  function applyFilters(data, query) {
    const startDateTime = query.start ? new Date(`${query.start}T00:00:00`) : new Date();
    const endDateTime = new Date(`${query.end}T23:59:59`);
    const filtered = filterEvents(data.events, {
      startDateTime,
      endDateTime,
      location: query.location,
      type: query.type,
    });
    setResults(filtered);
  }

  const failedSources = store.sources.filter((s) => !s.ok);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View>
            <Text style={styles.heading}>Eventos culturais — Coimbra</Text>
            <FilterForm onSearch={runSearch} searching={collecting} />

            {collecting ? (
              <View style={styles.loading}>
                <ActivityIndicator />
                <Text style={styles.loadingText}>
                  A recolher eventos das fontes reais — pode demorar um pouco...
                </Text>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {!collecting && failedSources.length > 0 ? (
              <View style={styles.warning}>
                <Text style={styles.warningTitle}>
                  ⚠ {failedSources.length} fonte(s) falharam na última recolha:
                </Text>
                {failedSources.map((s) => (
                  <Text key={s.name} style={styles.warningItem}>
                    • {s.name}: {s.error}
                  </Text>
                ))}
                <Text style={styles.warningNote}>Os resultados abaixo podem estar incompletos.</Text>
              </View>
            ) : null}

            {store.generatedAt ? (
              <Text style={styles.generatedAt}>
                Dados de {new Date(store.generatedAt).toLocaleString('pt-PT')}
              </Text>
            ) : null}

            {!collecting && lastQuery.current && results.length === 0 ? (
              <Text style={styles.empty}>Nenhum evento encontrado para estes critérios.</Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <EventCard event={item} onSeeDetails={setSelectedEvent} />}
        contentContainerStyle={styles.listContent}
      />

      <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  listContent: { paddingBottom: 24 },
  heading: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16, color: '#1a1a1a' },
  loading: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  loadingText: { fontSize: 13, color: '#666', textAlign: 'center', paddingHorizontal: 32 },
  error: { color: '#c0392b', marginHorizontal: 16, marginTop: 8 },
  warning: {
    backgroundColor: '#fff4e5',
    borderColor: '#f0b429',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
  },
  warningTitle: { fontWeight: '700', color: '#8a5a00', marginBottom: 4 },
  warningItem: { fontSize: 12, color: '#8a5a00' },
  warningNote: { fontSize: 12, color: '#8a5a00', marginTop: 4, fontStyle: 'italic' },
  generatedAt: { fontSize: 11, color: '#999', marginHorizontal: 16, marginTop: 10, marginBottom: 4 },
  empty: { textAlign: 'center', color: '#777', marginTop: 24, paddingHorizontal: 16 },
});
