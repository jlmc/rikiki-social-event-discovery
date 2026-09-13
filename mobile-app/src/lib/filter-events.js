/**
 * Date/location/type filtering rules — ported verbatim from the CLI's
 * lib/filter-events.js (pure logic, no Node APIs, so it works unchanged in
 * the React Native runtime).
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
