import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { LOCATIONS } from '../providers/viral-agenda';

// Simple text inputs for date/location/type — no native date-picker
// dependency, to keep the app buildable with just Expo's default
// packages. "YYYY-MM-DD" is validated the same way the CLI validates it.
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default function FilterForm({ onSearch, searching }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState('');
  const [error, setError] = useState('');

  function handleSubmit() {
    if (!end || !DATE_REGEX.test(end)) {
      setError('Indica uma data de fim válida (AAAA-MM-DD).');
      return;
    }
    if (start && !DATE_REGEX.test(start)) {
      setError('Data de início inválida (AAAA-MM-DD).');
      return;
    }
    setError('');
    onSearch({ start: start || null, end, location: location.trim(), type: type.trim() });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Data de fim *</Text>
      <TextInput
        style={styles.input}
        placeholder="AAAA-MM-DD"
        value={end}
        onChangeText={setEnd}
        autoCapitalize="none"
      />

      <Text style={styles.label}>Data de início (opcional, por omissão hoje)</Text>
      <TextInput
        style={styles.input}
        placeholder="AAAA-MM-DD"
        value={start}
        onChangeText={setStart}
        autoCapitalize="none"
      />

      <Text style={styles.label}>Localização (opcional)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {LOCATIONS.map((loc) => (
          <Pressable
            key={loc.slug}
            onPress={() => setLocation(location === loc.name ? '' : loc.name)}
            style={[styles.chip, location === loc.name && styles.chipActive]}
          >
            <Text style={[styles.chipText, location === loc.name && styles.chipTextActive]}>
              {loc.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.label}>Tipo de evento (opcional, texto livre — ex. "teatro")</Text>
      <TextInput
        style={styles.input}
        placeholder="teatro, concertos, infantil..."
        value={type}
        onChangeText={setType}
        autoCapitalize="none"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, searching && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={searching}
      >
        <Text style={styles.buttonText}>{searching ? 'A recolher...' : 'Pesquisar'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 4, color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#2b6cb0', borderColor: '#2b6cb0' },
  chipText: { fontSize: 13, color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  error: { color: '#c0392b', marginTop: 8 },
  button: {
    backgroundColor: '#2b6cb0',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
