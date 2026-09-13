'use strict';

/**
 * Date/location/type filtering rules shared by anything that needs to query
 * events.json (currently just list-events.js). Kept in one place so there
 * is a single source of truth for what "-location coimbra" or "-type
 * teatro" actually match.
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

// events: the "events" array from events.json.
// options.startDateTime / options.endDateTime: Date instances (required).
// options.location / options.type: raw filter text (optional, matched
// case-insensitively as a substring).
function filterEvents(events, { startDateTime, endDateTime, location, type }) {
  const locationFilter = (location || '').trim().toLowerCase();
  const typeFilter = (type || '').trim().toLowerCase();

  return (events || [])
    .filter((event) => withinDateRange(event, startDateTime, endDateTime))
    .filter((event) => matchesLocation(event, locationFilter))
    .filter((event) => matchesType(event, typeFilter))
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
}

module.exports = { filterEvents };
