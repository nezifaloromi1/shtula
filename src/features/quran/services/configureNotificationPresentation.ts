import * as Notifications from 'expo-notifications';
import { getNotificationPresentation } from './notificationPresentation';

Notifications.setNotificationHandler({
  handleNotification: async (notification) =>
    getNotificationPresentation(notification.request.content.data),
});
