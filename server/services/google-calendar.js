const { google } = require('googleapis');

class GoogleCalendarService {
  constructor(authClient) {
    this.auth = authClient;
    this.calendar = google.calendar({ version: 'v3', auth: authClient });
  }

  // List all calendars
  async listCalendars() {
    try {
      const response = await this.calendar.calendarList.list();
      return response.data.items.map(cal => ({
        id: cal.id,
        summary: cal.summary,
        description: cal.description,
        primary: cal.primary || false,
        backgroundColor: cal.backgroundColor,
        foregroundColor: cal.foregroundColor,
        selected: cal.selected !== false,
        accessRole: cal.accessRole
      }));
    } catch (error) {
      console.error('Error listing calendars:', error);
      throw error;
    }
  }

  // List events from specified calendars
  async listEvents(calendarIds, startDate, endDate, maxResults = 250) {
    try {
      const calendars = Array.isArray(calendarIds) ? calendarIds : [calendarIds];
      const allEvents = [];

      for (const calendarId of calendars) {
        const response = await this.calendar.events.list({
          calendarId: calendarId,
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          maxResults: maxResults,
          singleEvents: true,
          orderBy: 'startTime'
        });

        const events = (response.data.items || []).map(event => ({
          id: event.id,
          calendarId: calendarId,
          summary: event.summary || '(No title)',
          description: event.description,
          location: event.location,
          start: event.start.dateTime || event.start.date,
          end: event.end.dateTime || event.end.date,
          allDay: !event.start.dateTime,
          transparency: event.transparency,
          created: event.created,
          updated: event.updated,
          creator: event.creator,
          organizer: event.organizer,
          attendees: event.attendees,
          htmlLink: event.htmlLink,
          colorId: event.colorId
        }));

        allEvents.push(...events);
      }

      // Sort by start time
      allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

      return allEvents;
    } catch (error) {
      console.error('Error listing events:', error);
      throw error;
    }
  }

  // Get single event
  async getEvent(calendarId, eventId) {
    try {
      const response = await this.calendar.events.get({
        calendarId: calendarId,
        eventId: eventId
      });
      return response.data;
    } catch (error) {
      console.error('Error getting event:', error);
      throw error;
    }
  }

  // Create event
  async createEvent(calendarId, eventData) {
    try {
      const event = {
        summary: eventData.summary,
        description: eventData.description,
        location: eventData.location,
        start: eventData.allDay 
          ? { date: eventData.start }
          : { dateTime: eventData.start, timeZone: eventData.timeZone || 'UTC' },
        end: eventData.allDay
          ? { date: eventData.end }
          : { dateTime: eventData.end, timeZone: eventData.timeZone || 'UTC' },
        attendees: eventData.attendees,
        reminders: eventData.reminders || {
          useDefault: true
        }
      };

      const response = await this.calendar.events.insert({
        calendarId: calendarId,
        requestBody: event
      });

      return response.data;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  // Update event
  async updateEvent(calendarId, eventId, eventData) {
    try {
      const event = {
        summary: eventData.summary,
        description: eventData.description,
        location: eventData.location,
        start: eventData.allDay
          ? { date: eventData.start }
          : { dateTime: eventData.start, timeZone: eventData.timeZone || 'UTC' },
        end: eventData.allDay
          ? { date: eventData.end }
          : { dateTime: eventData.end, timeZone: eventData.timeZone || 'UTC' },
        attendees: eventData.attendees
      };

      const response = await this.calendar.events.update({
        calendarId: calendarId,
        eventId: eventId,
        requestBody: event
      });

      return response.data;
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  // Delete event
  async deleteEvent(calendarId, eventId) {
    try {
      await this.calendar.events.delete({
        calendarId: calendarId,
        eventId: eventId
      });
      return { success: true };
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }
}

module.exports = GoogleCalendarService;
