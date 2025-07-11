// This script runs in the background to receive notifications from Firebase

// Import Firebase SDKs
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCXscXexb0bvKEeJ9QKxnrhlB70F0ej7fs",
  authDomain: "arkanat-287ff.firebaseapp.com",
  projectId: "arkanat-287ff",
  storageBucket: "arkanat-287ff.appspot.com",
  messagingSenderId: "773019407626",
  appId: "1:773019407626:web:3b534f6c26c970693b16f3",
  measurementId: "G-81PYGC42FX"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle incoming messages when the app is in the background
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});