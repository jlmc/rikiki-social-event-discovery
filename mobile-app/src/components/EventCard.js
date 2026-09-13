import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';

const dateFormatter = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function summarize(description, maxLength = 160) {
  const paragraphs = (description || '').split('\n').filter(Boolean);
  const first = paragraphs.find((p) => p.length > 20) || paragraphs[0] || '';
  if (first.length <= maxLength) return first;
  return `${first.slice(0, maxLength).trim()}…`;
}

// A card, not a table row — filters + a grid of these is the whole UI, per
// the original request: select filters, search, see results as cards, each
// with a "see details" popup and a link to the official page in a new tab
// (here: the system browser, the mobile equivalent of "new tab").
export default function EventCard({ event, onSeeDetails }) {
  return (
    <View style={styles.card}>
      <Text style={styles.date}>{dateFormatter.format(new Date(event.dateTime))}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{event.category}</Text>
      </View>
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.location}>
        {event.location} — {event.venue}
      </Text>
      {event.description ? (
        <Text style={styles.description} numberOfLines={3}>
          {summarize(event.description)}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={styles.actionButton} onPress={() => onSeeDetails(event)}>
          <Text style={styles.actionText}>Ver detalhes</Text>
        </Pressable>
        {event.url ? (
          <Pressable
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => Linking.openURL(event.url)}
          >
            <Text style={styles.actionTextSecondary}>Página oficial</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  date: { fontSize: 12, color: '#666', marginBottom: 4 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e6effa',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 6,
  },
  badgeText: { fontSize: 11, color: '#2b6cb0', fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  location: { fontSize: 13, color: '#444', marginBottom: 6 },
  description: { fontSize: 13, color: '#555', marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#2b6cb0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonSecondary: { backgroundColor: '#eef1f4' },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  actionTextSecondary: { color: '#2b6cb0', fontWeight: '600', fontSize: 13 },
});
