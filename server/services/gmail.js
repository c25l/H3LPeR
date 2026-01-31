const { google } = require('googleapis');

class GmailService {
  constructor(authClient) {
    this.auth = authClient;
    this.gmail = google.gmail({ version: 'v1', auth: authClient });
  }

  // Get unread message count
  async getUnreadCount() {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 1
      });

      return response.data.resultSizeEstimate || 0;
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  }

  // List messages (inbox, sent, etc.)
  async listMessages(query = '', maxResults = 50, pageToken = null) {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: maxResults,
        pageToken: pageToken
      });

      return {
        messages: response.data.messages || [],
        nextPageToken: response.data.nextPageToken,
        resultSizeEstimate: response.data.resultSizeEstimate
      };
    } catch (error) {
      console.error('Error listing messages:', error);
      throw error;
    }
  }

  // Get full message details
  async getMessage(messageId) {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      const headers = this.parseHeaders(message.payload.headers);

      // Parse body
      const body = this.parseBody(message.payload);

      // Check for attachments
      const attachments = this.getAttachmentInfo(message.payload);

      return {
        id: message.id,
        threadId: message.threadId,
        labelIds: message.labelIds,
        snippet: message.snippet,
        internalDate: message.internalDate,
        from: headers.from,
        to: headers.to,
        cc: headers.cc,
        bcc: headers.bcc,
        subject: headers.subject,
        date: headers.date,
        body: body,
        attachments: attachments,
        hasAttachments: attachments.length > 0
      };
    } catch (error) {
      console.error('Error getting message:', error);
      throw error;
    }
  }

  // Get thread
  async getThread(threadId) {
    try {
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full'
      });

      const messages = await Promise.all(
        response.data.messages.map(msg => this.getMessage(msg.id))
      );

      return {
        id: response.data.id,
        snippet: response.data.snippet,
        messages: messages
      };
    } catch (error) {
      console.error('Error getting thread:', error);
      throw error;
    }
  }

  // Send email
  async sendMessage(to, subject, body, cc = null, bcc = null) {
    try {
      const email = this.createEmail(to, subject, body, cc, bcc);
      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  // Search messages
  async searchMessages(query, maxResults = 50) {
    return this.listMessages(query, maxResults);
  }

  // List labels
  async listLabels() {
    try {
      const response = await this.gmail.users.labels.list({
        userId: 'me'
      });

      return (response.data.labels || []).map(label => ({
        id: label.id,
        name: label.name,
        type: label.type,
        messageListVisibility: label.messageListVisibility,
        labelListVisibility: label.labelListVisibility
      }));
    } catch (error) {
      console.error('Error listing labels:', error);
      throw error;
    }
  }

  // Modify message labels
  async modifyLabels(messageId, addLabelIds = [], removeLabelIds = []) {
    try {
      const response = await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: addLabelIds,
          removeLabelIds: removeLabelIds
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error modifying labels:', error);
      throw error;
    }
  }

  // Mark as read/unread
  async markAsRead(messageId) {
    return this.modifyLabels(messageId, [], ['UNREAD']);
  }

  async markAsUnread(messageId) {
    return this.modifyLabels(messageId, ['UNREAD'], []);
  }

  // Archive message (remove INBOX label)
  async archiveMessage(messageId) {
    try {
      const response = await this.modifyLabels(messageId, [], ['INBOX']);
      return { success: true, messageId: messageId };
    } catch (error) {
      console.error('Error archiving message:', error);
      throw error;
    }
  }

  // Unarchive message (add INBOX label back)
  async unarchiveMessage(messageId) {
    try {
      const response = await this.modifyLabels(messageId, ['INBOX'], []);
      return { success: true, messageId: messageId };
    } catch (error) {
      console.error('Error unarchiving message:', error);
      throw error;
    }
  }

  // Trash message
  async trashMessage(messageId) {
    try {
      await this.gmail.users.messages.trash({
        userId: 'me',
        id: messageId
      });
      return { success: true, messageId: messageId };
    } catch (error) {
      console.error('Error trashing message:', error);
      throw error;
    }
  }

  // Untrash message (restore from trash)
  async untrashMessage(messageId) {
    try {
      await this.gmail.users.messages.untrash({
        userId: 'me',
        id: messageId
      });
      return { success: true, messageId: messageId };
    } catch (error) {
      console.error('Error untrashing message:', error);
      throw error;
    }
  }

  // Delete message permanently
  async deleteMessage(messageId) {
    try {
      await this.gmail.users.messages.delete({
        userId: 'me',
        id: messageId
      });
      return { success: true, messageId: messageId };
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  // Helper: Parse headers into key-value object
  parseHeaders(headers) {
    const result = {};
    headers.forEach(header => {
      const key = header.name.toLowerCase();
      result[key] = header.value;
    });
    return result;
  }

  // Helper: Parse message body
  parseBody(payload) {
    let body = '';

    if (payload.body && payload.body.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.parts) {
      // Multipart message
      const part = payload.parts.find(p => p.mimeType === 'text/html') ||
                   payload.parts.find(p => p.mimeType === 'text/plain');

      if (part && part.body && part.body.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }

    return body;
  }

  // Helper: Get attachment info (without downloading)
  getAttachmentInfo(payload) {
    const attachments = [];

    const extractAttachments = (parts) => {
      if (!parts) return;

      parts.forEach(part => {
        if (part.filename && part.body && part.body.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
            attachmentId: part.body.attachmentId
          });
        }

        if (part.parts) {
          extractAttachments(part.parts);
        }
      });
    };

    extractAttachments(payload.parts);
    return attachments;
  }

  // Helper: Create RFC 2822 email
  createEmail(to, subject, body, cc = null, bcc = null) {
    const lines = [
      `To: ${to}`,
      `Subject: ${subject}`
    ];

    if (cc) lines.push(`Cc: ${cc}`);
    if (bcc) lines.push(`Bcc: ${bcc}`);

    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('MIME-Version: 1.0');
    lines.push('');
    lines.push(body);

    return lines.join('\r\n');
  }
}

module.exports = GmailService;
