import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Accelerometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Register for remote notifications
async function registerForRemoteNotifications(): Promise<void> {
  try {
    // Check existing permissions
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    // Stop if permissions are not granted
    if (finalStatus !== 'granted') {
      console.log('Push notification permissions not granted.');
      return;
    }

    // Get the Expo push token
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Expo Push Token:', token);

    // For iOS, configure notification handling
    if (Platform.OS === 'ios') {
      await Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
  } catch (error) {
    console.error('Error registering for push notifications:', error);
  }
}

// Send a notification
async function sendNotification(count: number): Promise<void> {
  console.log('Sending notification for count:', count);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Phone Pickup Detected!',
      body: `You have picked up your phone ${count} times today.`,
    },
    trigger: null,
  });
}

// Increment the pickup count
async function incrementPickupCount(): Promise<number> {
  const currentCount = parseInt(
    (await AsyncStorage.getItem('pickupCount')) || '0',
    10
  );
  const newCount = currentCount + 1;
  console.log('Current count:', currentCount, 'New count:', newCount);
  await AsyncStorage.setItem('pickupCount', newCount.toString());
  return newCount;
}

// Monitor accelerometer for pickup detection
let accelerometerSubscription: { remove: () => void } | null = null;

function startMonitoring(onPickup: () => void): void {
  let previousState: { x: number; y: number; z: number } | null = null;

  accelerometerSubscription = Accelerometer.addListener((data) => {
    const { x, y, z } = data;

    if (previousState) {
      const significantMotion =
        Math.abs(previousState.x - x) > 1.5 ||
        Math.abs(previousState.y - y) > 1.5 ||
        Math.abs(previousState.z - z) > 1.5;

      const wasFlat = Math.abs(previousState.z) > 8; // Flat when z-axis is near ±9.8 m/s²
      const isUpright = Math.abs(z) < 5; // Upright when z-axis deviates significantly

      if (wasFlat && isUpright && significantMotion) {
        console.log('Phone picked up!');
        onPickup();
      }
    }

    previousState = { x, y, z };
  });

  Accelerometer.setUpdateInterval(100); // Check every 100ms
}

function stopMonitoring(): void {
  accelerometerSubscription?.remove();
  accelerometerSubscription = null;
}

const App: React.FC = () => {
  useEffect(() => {
    const setupApp = async () => {
      // Register for remote notifications
      await registerForRemoteNotifications();

      // Setup accelerometer monitoring
      const setupPermissions = async () => {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          const { status: newStatus } =
            await Notifications.requestPermissionsAsync();
          if (newStatus !== 'granted') {
            console.log('Notification permissions not granted.');
            return;
          }
        }

        const onPickup = async () => {
          const count = await incrementPickupCount();
          await sendNotification(count);
        };

        startMonitoring(onPickup);
      };

      await setupPermissions();
    };

    setupApp();

    return () => {
      stopMonitoring();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Phone Pickup Counter</Text>
      <Text style={styles.subtitle}>
        This app tracks how many times you pick up your phone and notifies you.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f8f8',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default App;
