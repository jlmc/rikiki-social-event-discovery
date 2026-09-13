/**
 * Date/location/type filtering rule — ported verbatim from cli/lib/filter-events.js
 * (pure logic, no Node/browser-specific APIs, so it's identical across all
 * three front-ends: the CLI, the mobile app, and this static site).
 */

function withinDateRange(event, startDateTime, endDateTime) {
  const eventDate = new Date(event.dateTime);
  return eventDate >= startDateTime && eventDate <= endDateTime;
}

function matchesLocation(event, locationFilter) {
  if (!locationFilter) return true;
  return (event.location || '').toLowerCase().includes(locationFilter);
}

function matchesType(event, typeFilter) {
  if (!typeFilter) return true;
  return (event.category || '').toLowerCase().includes(typeFilter);
}

export function filterEvents(events, { startDateTime, endDateTime, location, type }) {
  const locationFilter = (location || '').trim().toLowerCase();
  const typeFilter = (type || '').trim().toLowerCase();

  return (events || [])
    .filter((event) => withinDateRange(event, startDateTime, endDateTime))
    .filter((event) => matchesLocation(event, locationFilter))
    .filter((event) => matchesType(event, typeFilter))
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
}
