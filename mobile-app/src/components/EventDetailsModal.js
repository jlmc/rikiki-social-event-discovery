import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Linking } from 'react-native';

const dateFormatter = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Full-detail popup — everything we know about the event, without
// navigating away or resizing the card grid behind it (per the original
// request: "expande num popup todos os detalhes... sem partir o design").
export default function EventDetailsModal({ event, onClose }) {
  const visible = Boolean(event);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView>
            {event ? (
              <>
                <Text style={styles.date}>{dateFormatter.format(new Date(event.dateTime))}</Text>
                <Text style={styles.title}>{event.title}</Text>
                <Text style={styles.meta}>
                  {event.category} · {event.location} — {event.venue}
                </Text>

                {event.description ? (
                  <Text style={styles.description}>{event.description}</Text>
                ) : (
                  <Text style={styles.noData}>Sem descrição disponível para este evento.</Text>
                )}

                {event.participants && event.participants.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Participantes</Text>
                    {event.participants.map((p, i) => (
                      <Text key={i} style={styles.participant}>
                        • {p}
                      </Text>
                    ))}
                  </View>
                ) : null}

                <Text style={styles.source}>Fonte: {event.source}</Text>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            {event?.url ? (
              <Pressable
                style={[styles.actionButton, styles.actionButtonSecondary]}
                onPress={() => Linking.openURL(event.url)}
              >
                <Text style={styles.actionTextSecondary}>Página oficial</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.actionButton} onPress={onClose}>
              <Text style={styles.actionText}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  date: { fontSize: 13, color: '#666', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 6, color: '#1a1a1a' },
  meta: { fontSize: 13, color: '#444', marginBottom: 14 },
  description: { fontSize: 14, lineHeight: 21, color: '#333', marginBottom: 14 },
  noData: { fontSize: 14, color: '#888', fontStyle: 'italic', marginBottom: 14 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6, color: '#333' },
  participant: { fontSize: 13, color: '#444', marginBottom: 2 },
  source: { fontSize: 12, color: '#999', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#2b6cb0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonSecondary: { backgroundColor: '#eef1f4' },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  actionTextSecondary: { color: '#2b6cb0', fontWeight: '700', fontSize: 15 },
});
