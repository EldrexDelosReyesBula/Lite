// NearCheck Lite - Professional Web App
// Version 1.0.0
// Developed by Eldrex Delos Reyes Bula

// =============================================
// Firebase Configuration and Initialization
// =============================================
const firebaseConfig = {
    apiKey: "AIzaSyCVP8zaUj2iDrooLbRQNypHqB8QNTLhGDE",
    authDomain: "attendance-fe1c8.firebaseapp.com",
    projectId: "attendance-fe1c8",
    storageBucket: "attendance-fe1c8.appspot.com",
    messagingSenderId: "903463376704",
    appId: "1:903463376704:web:d004c563d56aa286df8ca5",
    measurementId: "G-YY5GQZPSRK"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(app);
const db = firebase.firestore(app);
const rtdb = firebase.database(app);
const messaging = firebase.messaging(app);

// Initialize App Check
const appCheck = firebase.appCheck();
appCheck.activate('EXAMPLE-APP-CHECK-SITE-KEY');

// =============================================
// Global Variables and Constants
// =============================================
const APP_NAME = "NearCheck Lite";
const APP_VERSION = "1.0.0";
const TEACHER_MIN_AGE = 20;
const STUDENT_MIN_AGE = 13;
const AVATAR_CHANGE_COOLDOWN = 5 * 24 * 60 * 60 * 1000; // 5 days in ms
const DEFAULT_CHECKIN_RADIUS = 10; // meters
const MAX_CHECKIN_RADIUS = 150; // meters
const MIN_CHECKIN_RADIUS = 5; // meters

let currentUser = null;
let currentRole = null;
let currentTheme = 'auto';
let appInitialized = false;
let activeSessions = [];
let enrolledSections = [];
let pendingCheckIns = [];
let notificationPermission = null;
let fcmToken = null;

// =============================================
// Utility Functions
// =============================================

// Generate random color for avatar background
function getRandomColor() {
    const colors = [
        '#FF5252', '#FF4081', '#E040FB', '#7C4DFF', '#536DFE',
        '#448AFF', '#40C4FF', '#18FFFF', '#64FFDA', '#69F0AE',
        '#B2FF59', '#EEFF41', '#FFFF00', '#FFD740', '#FFAB40',
        '#FF6E40', '#FF3D00'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Format date to readable string
function formatDate(date, includeTime = true) {
    if (!date) return 'N/A';

    const d = date.toDate ? date.toDate() : new Date(date);
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: includeTime ? '2-digit' : undefined,
        minute: includeTime ? '2-digit' : undefined
    };

    return d.toLocaleDateString('en-US', options);
}

// Calculate distance between two coordinates in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// Generate username from full name
function generateUsername(fullName) {
    if (!fullName) return 'user' + Math.floor(Math.random() * 10000);

    const nameParts = fullName.trim().toLowerCase().split(' ');
    let username = '';

    if (nameParts.length === 1) {
        username = nameParts[0].substring(0, 8);
    } else {
        username = nameParts[0].charAt(0) + nameParts[nameParts.length - 1].substring(0, 7);
    }

    // Remove special characters
    username = username.replace(/[^a-z0-9]/g, '');

    // Add random numbers if too short
    if (username.length < 3) {
        username += Math.floor(Math.random() * 1000);
    }

    return username + '@nearcheck';
}

// Show loading spinner
function showLoading(message = 'Loading...') {
    const loadingScreen = document.querySelector('.loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
        const loadingText = loadingScreen.querySelector('.loading-text');
        if (loadingText) loadingText.textContent = message;
    }
}

// Hide loading spinner
function hideLoading() {
    const loadingScreen = document.querySelector('.loading-screen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            loadingScreen.style.opacity = '1';
        }, 500);
    }
}

// Create a bottom sheet modal
function createModal(title, content, buttons = [], options = {}) {
    // Close any existing modal first
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) existingModal.remove();

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modalOverlay.style.display = 'flex';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.alignItems = 'flex-end';
    modalOverlay.style.zIndex = '1000';
    modalOverlay.style.opacity = '0';
    modalOverlay.style.transition = 'opacity 0.3s ease';

    const modalSheet = document.createElement('div');
    modalSheet.className = 'modal-sheet';
    modalSheet.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--background-color') || 'white';
    modalSheet.style.width = '100%';
    modalSheet.style.maxWidth = '500px';
    modalSheet.style.borderTopLeftRadius = '16px';
    modalSheet.style.borderTopRightRadius = '16px';
    modalSheet.style.padding = '20px';
    modalSheet.style.boxShadow = '0 -5px 20px rgba(0,0,0,0.1)';
    modalSheet.style.transform = 'translateY(100%)';
    modalSheet.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';

    // Modal header
    const modalHeader = document.createElement('div');
    modalHeader.style.display = 'flex';
    modalHeader.style.justifyContent = 'space-between';
    modalHeader.style.alignItems = 'center';
    modalHeader.style.marginBottom = '16px';

    const modalTitle = document.createElement('h3');
    modalTitle.textContent = title;
    modalTitle.style.margin = '0';
    modalTitle.style.fontSize = '18px';
    modalTitle.style.fontWeight = '600';

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '<i class="fas fa-times"></i>';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = getComputedStyle(document.documentElement).getPropertyValue('--text-color') || '#333';

    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);

    // Modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.marginBottom = '20px';
    modalContent.style.maxHeight = '60vh';
    modalContent.style.overflowY = 'auto';

    if (typeof content === 'string') {
        modalContent.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        modalContent.appendChild(content);
    } else {
        modalContent.textContent = content;
    }

    // Modal footer
    const modalFooter = document.createElement('div');
    modalFooter.className = 'modal-footer';
    modalFooter.style.display = 'flex';
    modalFooter.style.justifyContent = 'flex-end';
    modalFooter.style.gap = '10px';

    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        button.className = btn.class || 'btn';

        if (btn.style) {
            Object.assign(button.style, btn.style);
        }

        button.onclick = (e) => {
            if (btn.action) btn.action(e);
            if (btn.close !== false) modalOverlay.remove();
        };

        modalFooter.appendChild(button);
    });

    modalSheet.appendChild(modalHeader);
    modalSheet.appendChild(modalContent);
    modalSheet.appendChild(modalFooter);
    modalOverlay.appendChild(modalSheet);

    document.body.appendChild(modalOverlay);

    // Animate in
    setTimeout(() => {
        modalOverlay.style.opacity = '1';
        modalSheet.style.transform = 'translateY(0)';
    }, 10);

    // Close modal when clicking overlay
    modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) {
            modalSheet.style.transform = 'translateY(100%)';
            modalOverlay.style.opacity = '0';
            setTimeout(() => modalOverlay.remove(), 300);
        }
    };

    // Close modal when clicking close button
    closeButton.onclick = () => {
        modalSheet.style.transform = 'translateY(100%)';
        modalOverlay.style.opacity = '0';
        setTimeout(() => modalOverlay.remove(), 300);
    };

    return {
        element: modalSheet,
        close: () => {
            modalSheet.style.transform = 'translateY(100%)';
            modalOverlay.style.opacity = '0';
            setTimeout(() => modalOverlay.remove(), 300);
        }
    };
}

// Create a toast notification
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '12px 24px';
    toast.style.backgroundColor = type === 'error' ? '#FF5252' :
        type === 'success' ? '#4CAF50' : '#2196F3';
    toast.style.color = 'white';
    toast.style.borderRadius = '4px';
    toast.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
    toast.style.zIndex = '1001';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '1';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Create a confirmation dialog
async function showConfirmation(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
        const modal = createModal(title, message, [{
                text: cancelText,
                action: () => resolve(false),
                style: {
                    background: 'none',
                    color: 'var(--text-color)'
                }
            },
            {
                text: confirmText,
                action: () => resolve(true),
                style: {
                    background: 'var(--primary-color)',
                    color: 'white'
                }
            }
        ]);
    });
}

// Create a password confirmation dialog
async function confirmPassword() {
    return new Promise((resolve) => {
        const passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.placeholder = 'Enter your password';
        passwordInput.style.width = '100%';
        passwordInput.style.padding = '10px';
        passwordInput.style.marginBottom = '10px';
        passwordInput.style.border = '1px solid #ddd';
        passwordInput.style.borderRadius = '4px';

        const modal = createModal('Confirm Password', passwordInput, [{
                text: 'Cancel',
                action: () => resolve(false),
                style: {
                    background: 'none',
                    color: 'var(--text-color)'
                }
            },
            {
                text: 'Confirm',
                action: async () => {
                    try {
                        const credential = firebase.auth.EmailAuthProvider.credential(
                            currentUser.email,
                            passwordInput.value
                        );
                        await currentUser.reauthenticateWithCredential(credential);
                        resolve(true);
                    } catch (error) {
                        showToast('Incorrect password', 'error');
                        resolve(false);
                    }
                },
                style: {
                    background: 'var(--primary-color)',
                    color: 'white'
                }
            }
        ]);
    });
}

// =============================================
// Authentication Functions
// =============================================

// Check if user is authenticated
async function checkAuth() {
    showLoading('Checking authentication...');

    return new Promise((resolve) => {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                currentUser = user;

                // Get user role from Firestore
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    currentRole = userDoc.data().role;

                    // Load user preferences
                    await loadUserPreferences();

                    // Initialize app based on role
                    if (currentRole === 'teacher') {
                        await initTeacherDashboard();
                    } else if (currentRole === 'student') {
                        await initStudentDashboard();
                    }

                    appInitialized = true;
                    resolve(true);
                } else {
                    // User document doesn't exist - sign out
                    await auth.signOut();
                    showWelcomeScreen();
                    resolve(false);
                }
            } else {
                showWelcomeScreen();
                resolve(false);
            }

            hideLoading();
        });
    });
}

// Sign up a new user
async function signUp(fullName, email, password, role, sectionId = null) {
    showLoading('Creating account...');

    try {
        // Create Firebase auth user
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Generate username
        const username = generateUsername(fullName);

        // Create user document in Firestore
        await db.collection('users').doc(user.uid).set({
            uid: user.uid,
            fullName: fullName.trim(),
            username: username,
            email: email,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            avatar: {
                emoji: '👤',
                text: fullName.trim().charAt(0).toUpperCase(),
                bgColor: getRandomColor(),
                lastChanged: new Date().getTime()
            },
            preferences: {
                theme: 'auto',
                fontSize: 'medium',
                accentColor: 'blue',
                locationReminder: true,
                checkinRadius: DEFAULT_CHECKIN_RADIUS,
                checkinConfirmation: true,
                notifications: false,
                sessionTimeout: 30
            }
        });

        // If student and sectionId provided, enroll in section
        if (role === 'student' && sectionId) {
            await enrollInSection(sectionId, user.uid);
        }

        currentUser = user;
        currentRole = role;

        // Load user preferences
        await loadUserPreferences();

        // Initialize appropriate dashboard
        if (role === 'teacher') {
            await initTeacherDashboard();
        } else {
            await initStudentDashboard();
        }

        showToast('Account created successfully!', 'success');
        appInitialized = true;
    } catch (error) {
        console.error('Sign up error:', error);

        let errorMessage = 'An error occurred during sign up.';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already in use.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Please enter a valid email address.';
        }

        showToast(errorMessage, 'error');
    } finally {
        hideLoading();
    }
}

// Sign in a user
async function signIn(email, password) {
    showLoading('Signing in...');

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        currentUser = userCredential.user;

        // Get user role from Firestore
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            currentRole = userDoc.data().role;

            // Load user preferences
            await loadUserPreferences();

            // Initialize appropriate dashboard
            if (currentRole === 'teacher') {
                await initTeacherDashboard();
            } else {
                await initStudentDashboard();
            }

            showToast('Signed in successfully!', 'success');
            appInitialized = true;
        } else {
            // User document doesn't exist - sign out
            await auth.signOut();
            showToast('User account not found.', 'error');
            showWelcomeScreen();
        }
    } catch (error) {
        console.error('Sign in error:', error);

        let errorMessage = 'An error occurred during sign in.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = 'Invalid email or password.';
        } else if (error.code === 'auth/user-disabled') {
            errorMessage = 'This account has been disabled.';
        }

        showToast(errorMessage, 'error');
    } finally {
        hideLoading();
    }
}

// Sign out the current user
async function signOut() {
    showLoading('Signing out...');

    try {
        await auth.signOut();
        currentUser = null;
        currentRole = null;
        appInitialized = false;

        // Clear any active intervals or timeouts
        // ...

        showWelcomeScreen();
        showToast('Signed out successfully', 'success');
    } catch (error) {
        console.error('Sign out error:', error);
        showToast('Error signing out', 'error');
    } finally {
        hideLoading();
    }
}

// Send password reset email
async function sendPasswordResetEmail(email) {
    showLoading('Sending reset email...');

    try {
        await auth.sendPasswordResetEmail(email);
        showToast('Password reset email sent!', 'success');
    } catch (error) {
        console.error('Password reset error:', error);
        showToast('Error sending reset email', 'error');
    } finally {
        hideLoading();
    }
}

// =============================================
// User Profile Functions
// =============================================

// Load user preferences
async function loadUserPreferences() {
    if (!currentUser) return;

    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) {
        const userData = userDoc.data();

        // Apply theme preference
        if (userData.preferences?.theme) {
            currentTheme = userData.preferences.theme;
            applyTheme(currentTheme);
        }

        // Apply other UI preferences
        applyUIPreferences(userData.preferences);
    }
}

// Update user profile
async function updateProfile(updates) {
    if (!currentUser) return;

    try {
        await db.collection('users').doc(currentUser.uid).update(updates);
        showToast('Profile updated successfully!', 'success');
        return true;
    } catch (error) {
        console.error('Update profile error:', error);
        showToast('Error updating profile', 'error');
        return false;
    }
}

// Change user avatar (emoji and text)
async function changeAvatar(emoji, text) {
    if (!currentUser) return;

    // Check if user can change avatar (5-day cooldown)
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) {
        const userData = userDoc.data();
        const lastChanged = userData.avatar?.lastChanged || 0;
        const now = new Date().getTime();

        if (now - lastChanged < AVATAR_CHANGE_COOLDOWN) {
            const daysLeft = Math.ceil((AVATAR_CHANGE_COOLDOWN - (now - lastChanged)) / (1000 * 60 * 60 * 24));
            showToast(`You can change your avatar again in ${daysLeft} days.`, 'info');
            return false;
        }
    }

    // Validate inputs
    if (!emoji || !text || text.length > 2) {
        showToast('Avatar must include 1 emoji and 1-2 letters', 'error');
        return false;
    }

    try {
        await db.collection('users').doc(currentUser.uid).update({
            'avatar.emoji': emoji,
            'avatar.text': text,
            'avatar.lastChanged': new Date().getTime()
        });

        showToast('Avatar updated successfully!', 'success');
        return true;
    } catch (error) {
        console.error('Change avatar error:', error);
        showToast('Error updating avatar', 'error');
        return false;
    }
}

// Change user password
async function changePassword(currentPassword, newPassword) {
    if (!currentUser) return;

    try {
        // Reauthenticate user
        const credential = firebase.auth.EmailAuthProvider.credential(
            currentUser.email,
            currentPassword
        );
        await currentUser.reauthenticateWithCredential(credential);

        // Change password
        await currentUser.updatePassword(newPassword);

        showToast('Password changed successfully!', 'success');
        return true;
    } catch (error) {
        console.error('Change password error:', error);

        let errorMessage = 'Error changing password';
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Current password is incorrect';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters';
        }

        showToast(errorMessage, 'error');
        return false;
    }
}

// =============================================
// Theme and UI Functions
// =============================================

// Apply theme to the app
function applyTheme(theme) {
    const root = document.documentElement;

    // Determine actual theme based on preference
    let actualTheme = theme;
    if (theme === 'auto') {
        actualTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    // Set CSS variables based on theme
    if (actualTheme === 'dark') {
        root.style.setProperty('--background-color', '#121212');
        root.style.setProperty('--surface-color', '#1E1E1E');
        root.style.setProperty('--primary-color', '#1976D2');
        root.style.setProperty('--secondary-color', '#424242');
        root.style.setProperty('--text-color', '#FFFFFF');
        root.style.setProperty('--text-secondary', '#B0B0B0');
        root.style.setProperty('--border-color', '#333333');
    } else {
        root.style.setProperty('--background-color', '#FFFFFF');
        root.style.setProperty('--surface-color', '#F5F5F5');
        root.style.setProperty('--primary-color', '#1976D2');
        root.style.setProperty('--secondary-color', '#E0E0E0');
        root.style.setProperty('--text-color', '#333333');
        root.style.setProperty('--text-secondary', '#666666');
        root.style.setProperty('--border-color', '#E0E0E0');
    }

    // Store theme preference
    if (currentUser) {
        db.collection('users').doc(currentUser.uid).update({
            'preferences.theme': theme
        });
    }
}

// Apply UI preferences (font size, accent color, etc.)
function applyUIPreferences(preferences) {
    const root = document.documentElement;

    // Font size
    if (preferences?.fontSize) {
        let fontSize = '16px';
        if (preferences.fontSize === 'small') fontSize = '14px';
        else if (preferences.fontSize === 'large') fontSize = '18px';

        root.style.setProperty('--base-font-size', fontSize);
    }

    // Accent color
    if (preferences?.accentColor) {
        let accentColor = '#1976D2'; // NearCheck Blue
        if (preferences.accentColor === 'charcoal') accentColor = '#424242';
        else if (preferences.accentColor === 'cream') accentColor = '#FFE0B2';

        root.style.setProperty('--primary-color', accentColor);
    }
}

// =============================================
// Teacher-Specific Functions
// =============================================

// Initialize teacher dashboard
async function initTeacherDashboard() {
    // Clear existing content
    const app = document.getElementById('app');
    app.innerHTML = '';

    // Create dashboard structure
    const dashboard = document.createElement('div');
    dashboard.className = 'dashboard teacher-dashboard';
    dashboard.style.display = 'flex';
    dashboard.style.flexDirection = 'column';
    dashboard.style.height = '100vh';
    dashboard.style.overflow = 'hidden';

    // Create header
    const header = document.createElement('header');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.padding = '16px';
    header.style.backgroundColor = 'var(--surface-color)';
    header.style.borderBottom = '1px solid var(--border-color)';

    const headerLeft = document.createElement('div');
    headerLeft.style.display = 'flex';
    headerLeft.style.alignItems = 'center';
    headerLeft.style.gap = '12px';

    const menuButton = document.createElement('button');
    menuButton.innerHTML = '<i class="fas fa-bars"></i>';
    menuButton.className = 'icon-button';
    menuButton.onclick = showTeacherMenu;

    const title = document.createElement('h1');
    title.textContent = 'Teacher Dashboard';
    title.style.margin = '0';
    title.style.fontSize = '20px';
    title.style.fontWeight = '600';

    headerLeft.appendChild(menuButton);
    headerLeft.appendChild(title);

    const headerRight = document.createElement('div');
    headerRight.style.display = 'flex';
    headerRight.style.alignItems = 'center';
    headerRight.style.gap = '12px';

    const notificationButton = document.createElement('button');
    notificationButton.innerHTML = '<i class="fas fa-bell"></i>';
    notificationButton.className = 'icon-button';
    notificationButton.onclick = showNotifications;

    const profileButton = document.createElement('button');
    profileButton.className = 'avatar-button';
    profileButton.onclick = showProfileMenu;

    // Load user avatar
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) {
        const userData = userDoc.data();
        profileButton.innerHTML = `
            <div class="avatar" style="background-color: ${userData.avatar?.bgColor || '#1976D2'}">
                ${userData.avatar?.emoji || '👤'}${userData.avatar?.text || ''}
            </div>
        `;
    }

    headerRight.appendChild(notificationButton);
    headerRight.appendChild(profileButton);

    header.appendChild(headerLeft);
    header.appendChild(headerRight);

    // Create main content area
    const mainContent = document.createElement('main');
    mainContent.style.flex = '1';
    mainContent.style.overflowY = 'auto';
    mainContent.style.padding = '16px';

    // Add greeting based on time of day
    const greeting = document.createElement('div');
    greeting.className = 'greeting';

    const now = new Date();
    const hour = now.getHours();
    let greetingText = 'Good ';

    if (hour < 12) greetingText += 'Morning';
    else if (hour < 18) greetingText += 'Afternoon';
    else greetingText += 'Evening';

    greeting.innerHTML = `
        <h2 style="margin: 0 0 8px 0;">${greetingText}, ${userDoc.data().fullName.split(' ')[0]}</h2>
        <p style="margin: 0; color: var(--text-secondary);">${formatDate(now, false)}</p>
    `;

    mainContent.appendChild(greeting);

    // Add sections carousel
    const sectionsHeader = document.createElement('div');
    sectionsHeader.style.display = 'flex';
    sectionsHeader.style.justifyContent = 'space-between';
    sectionsHeader.style.alignItems = 'center';
    sectionsHeader.style.margin = '24px 0 12px 0';

    const sectionsTitle = document.createElement('h3');
    sectionsTitle.textContent = 'Your Sections';
    sectionsTitle.style.margin = '0';

    const createSectionButton = document.createElement('button');
    createSectionButton.textContent = '+ Create';
    createSectionButton.className = 'text-button';
    createSectionButton.style.color = 'var(--primary-color)';
    createSectionButton.onclick = showCreateSectionModal;

    sectionsHeader.appendChild(sectionsTitle);
    sectionsHeader.appendChild(createSectionButton);

    mainContent.appendChild(sectionsHeader);

    const sectionsCarousel = document.createElement('div');
    sectionsCarousel.className = 'carousel';
    sectionsCarousel.style.display = 'flex';
    sectionsCarousel.style.gap = '12px';
    sectionsCarousel.style.overflowX = 'auto';
    sectionsCarousel.style.paddingBottom = '8px';
    sectionsCarousel.style.scrollSnapType = 'x mandatory';

    // Load teacher's sections
    const sectionsSnapshot = await db.collection('sections')
        .where('teacherId', '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .get();

    if (sectionsSnapshot.empty) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.style.textAlign = 'center';
        emptyState.style.padding = '32px 16px';
        emptyState.style.color = 'var(--text-secondary)';

        emptyState.innerHTML = `
            <i class="fas fa-chalkboard-teacher" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
            <p style="margin: 0;">You haven't created any sections yet.</p>
            <button class="text-button" style="margin-top: 8px; color: var(--primary-color);" onclick="showCreateSectionModal()">
                Create your first section
            </button>
        `;

        sectionsCarousel.appendChild(emptyState);
    } else {
        activeSessions = [];

        sectionsSnapshot.forEach(doc => {
            const section = doc.data();
            const sectionId = doc.id;

            const sectionCard = document.createElement('div');
            sectionCard.className = 'section-card';
            sectionCard.style.minWidth = '280px';
            sectionCard.style.scrollSnapAlign = 'start';
            sectionCard.style.backgroundColor = 'var(--surface-color)';
            sectionCard.style.borderRadius = '12px';
            sectionCard.style.padding = '16px';
            sectionCard.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            sectionCard.style.position = 'relative';
            sectionCard.style.overflow = 'hidden';

            // Check if this section has an active session
            const isActive = section.activeSession &&
                new Date(section.activeSession.endTime.toDate()) > new Date();

            if (isActive) {
                activeSessions.push({
                    sectionId: sectionId,
                    ...section.activeSession
                });

                sectionCard.style.borderLeft = '4px solid var(--primary-color)';
            }

            sectionCard.innerHTML = `
                <h3 style="margin: 0 0 8px 0; font-size: 16px;">${section.name}</h3>
                <p style="margin: 0 0 4px 0; font-size: 14px; color: var(--text-secondary);">${section.subject}</p>
                <p style="margin: 0 0 12px 0; font-size: 14px; color: var(--text-secondary);">
                    ${section.schedule}
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 12px; color: var(--text-secondary);">
                        ${section.students?.length || 0} students
                    </span>
                    <button class="text-button" style="color: var(--primary-color);">
                        Manage
                    </button>
                </div>
            `;

            // Add click handler to manage button
            const manageButton = sectionCard.querySelector('button');
            manageButton.onclick = (e) => {
                e.stopPropagation();
                showSectionManagement(sectionId, section);
            };

            // Add click handler to entire card
            sectionCard.onclick = () => {
                showSectionDetails(sectionId, section);
            };

            sectionsCarousel.appendChild(sectionCard);
        });
    }

    mainContent.appendChild(sectionsCarousel);

    // Add attendance summary
    const summaryHeader = document.createElement('div');
    summaryHeader.style.display = 'flex';
    summaryHeader.style.justifyContent = 'space-between';
    summaryHeader.style.alignItems = 'center';
    summaryHeader.style.margin = '24px 0 12px 0';

    const summaryTitle = document.createElement('h3');
    summaryTitle.textContent = 'Today\'s Summary';
    summaryTitle.style.margin = '0';

    const viewAllButton = document.createElement('button');
    viewAllButton.textContent = 'View All';
    viewAllButton.className = 'text-button';
    viewAllButton.style.color = 'var(--primary-color)';
    viewAllButton.onclick = showAllAttendance;

    summaryHeader.appendChild(summaryTitle);
    summaryHeader.appendChild(viewAllButton);

    mainContent.appendChild(summaryHeader);

    const summaryCards = document.createElement('div');
    summaryCards.style.display = 'grid';
    summaryCards.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
    summaryCards.style.gap = '12px';
    summaryCards.style.marginBottom = '24px';

    // Add summary cards (placeholder for now)
    const summaries = [{
            title: 'Present',
            value: '0',
            icon: 'fas fa-check',
            color: '#4CAF50'
        },
        {
            title: 'Absent',
            value: '0',
            icon: 'fas fa-times',
            color: '#F44336'
        },
        {
            title: 'Late',
            value: '0',
            icon: 'fas fa-clock',
            color: '#FF9800'
        },
        {
            title: 'Sections',
            value: sectionsSnapshot.size,
            icon: 'fas fa-chalkboard',
            color: '#2196F3'
        }
    ];

    summaries.forEach(item => {
        const card = document.createElement('div');
        card.className = 'summary-card';
        card.style.backgroundColor = 'var(--surface-color)';
        card.style.borderRadius = '12px';
        card.style.padding = '16px';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 14px; color: var(--text-secondary);">${item.title}</span>
                <i class="${item.icon}" style="color: ${item.color};"></i>
            </div>
            <div style="font-size: 24px; font-weight: 600;">${item.value}</div>
        `;

        summaryCards.appendChild(card);
    });

    mainContent.appendChild(summaryCards);

    // Add recent activity
    const activityHeader = document.createElement('h3');
    activityHeader.textContent = 'Recent Activity';
    activityHeader.style.margin = '24px 0 12px 0';

    mainContent.appendChild(activityHeader);

    const activityList = document.createElement('div');
    activityList.className = 'activity-list';

    // Add placeholder activity items
    const activities = [{
            text: 'You created Section A',
            time: '2 hours ago'
        },
        {
            text: 'Student checked in to Section B',
            time: '4 hours ago'
        },
        {
            text: 'You started a session for Section C',
            time: '1 day ago'
        }
    ];

    activities.forEach(activity => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '12px 0';
        item.style.borderBottom = '1px solid var(--border-color)';

        item.innerHTML = `
            <div style="flex: 1;">
                <p style="margin: 0; font-size: 14px;">${activity.text}</p>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-secondary);">${activity.time}</p>
            </div>
            <i class="fas fa-chevron-right" style="color: var(--text-secondary);"></i>
        `;

        activityList.appendChild(item);
    });

    mainContent.appendChild(activityList);

    // Add footer
    const footer = document.createElement('footer');
    footer.style.padding = '12px 16px';
    footer.style.backgroundColor = 'var(--surface-color)';
    footer.style.borderTop = '1px solid var(--border-color)';
    footer.style.textAlign = 'center';
    footer.style.fontSize = '12px';
    footer.style.color = 'var(--text-secondary)';
    footer.textContent = `NearCheck Lite v${APP_VERSION}`;

    dashboard.appendChild(header);
    dashboard.appendChild(mainContent);
    dashboard.appendChild(footer);

    app.appendChild(dashboard);

    // Load real data for summaries and activities
    loadTeacherSummaryData();
}

// Show teacher menu
function showTeacherMenu() {
    const menuItems = [{
            icon: 'fas fa-home',
            text: 'Dashboard',
            action: initTeacherDashboard
        },
        {
            icon: 'fas fa-calendar-alt',
            text: 'Attendance Reports',
            action: showAttendanceReports
        },
        {
            icon: 'fas fa-cog',
            text: 'Settings',
            action: showSettings
        },
        {
            icon: 'fas fa-question-circle',
            text: 'Help & Support',
            action: showHelp
        },
        {
            icon: 'fas fa-sign-out-alt',
            text: 'Sign Out',
            action: signOut
        }
    ];

    const menuContent = document.createElement('div');
    menuContent.style.padding = '16px 0';

    menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item';
        menuItem.style.display = 'flex';
        menuItem.style.alignItems = 'center';
        menuItem.style.padding = '12px 16px';
        menuItem.style.cursor = 'pointer';

        menuItem.innerHTML = `
            <i class="${item.icon}" style="margin-right: 12px; width: 24px; text-align: center;"></i>
            <span>${item.text}</span>
        `;

        menuItem.onclick = item.action;

        menuItem.addEventListener('mouseenter', () => {
            menuItem.style.backgroundColor = 'var(--secondary-color)';
        });

        menuItem.addEventListener('mouseleave', () => {
            menuItem.style.backgroundColor = 'transparent';
        });

        menuContent.appendChild(menuItem);
    });

    createModal('Menu', menuContent, [], {
        fullScreen: true
    });
}

// Show create section modal
function showCreateSectionModal() {
    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '16px';

    // Section name
    const nameGroup = document.createElement('div');
    nameGroup.style.display = 'flex';
    nameGroup.style.flexDirection = 'column';
    nameGroup.style.gap = '4px';

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Section Name';
    nameLabel.style.fontWeight = '500';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'e.g., Section A, Grade 11 STEM';
    nameInput.required = true;
    nameInput.style.padding = '12px';
    nameInput.style.border = '1px solid var(--border-color)';
    nameInput.style.borderRadius = '8px';

    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);

    // Subject
    const subjectGroup = document.createElement('div');
    subjectGroup.style.display = 'flex';
    subjectGroup.style.flexDirection = 'column';
    subjectGroup.style.gap = '4px';

    const subjectLabel = document.createElement('label');
    subjectLabel.textContent = 'Subject';
    subjectLabel.style.fontWeight = '500';

    const subjectInput = document.createElement('input');
    subjectInput.type = 'text';
    subjectInput.placeholder = 'e.g., Mathematics, Science';
    subjectInput.required = true;
    subjectInput.style.padding = '12px';
    subjectInput.style.border = '1px solid var(--border-color)';
    subjectInput.style.borderRadius = '8px';

    subjectGroup.appendChild(subjectLabel);
    subjectGroup.appendChild(subjectInput);

    // Schedule
    const scheduleGroup = document.createElement('div');
    scheduleGroup.style.display = 'flex';
    scheduleGroup.style.flexDirection = 'column';
    scheduleGroup.style.gap = '4px';

    const scheduleLabel = document.createElement('label');
    scheduleLabel.textContent = 'Schedule';
    scheduleLabel.style.fontWeight = '500';

    const scheduleInput = document.createElement('input');
    scheduleInput.type = 'text';
    scheduleInput.placeholder = 'e.g., Mon/Wed/Fri 9:00-10:00 AM';
    scheduleInput.required = true;
    scheduleInput.style.padding = '12px';
    scheduleInput.style.border = '1px solid var(--border-color)';
    scheduleInput.style.borderRadius = '8px';

    scheduleGroup.appendChild(scheduleLabel);
    scheduleGroup.appendChild(scheduleInput);

    // Location
    const locationGroup = document.createElement('div');
    locationGroup.style.display = 'flex';
    locationGroup.style.flexDirection = 'column';
    locationGroup.style.gap = '4px';

    const locationLabel = document.createElement('label');
    locationLabel.textContent = 'Default Location';
    locationLabel.style.fontWeight = '500';

    const locationButton = document.createElement('button');
    locationButton.type = 'button';
    locationButton.textContent = 'Set Current Location';
    locationButton.className = 'btn';
    locationButton.style.width = '100%';
    locationButton.onclick = async () => {
        try {
            showLoading('Getting your location...');
            const position = await getCurrentPosition();

            locationButton.textContent = 'Location Set';
            locationButton.style.backgroundColor = '#4CAF50';
            locationButton.disabled = true;

            // Store coordinates in data attributes
            locationButton.dataset.latitude = position.coords.latitude;
            locationButton.dataset.longitude = position.coords.longitude;

            showToast('Location set successfully', 'success');
        } catch (error) {
            console.error('Location error:', error);
            showToast('Error getting location', 'error');
        } finally {
            hideLoading();
        }
    };

    locationGroup.appendChild(locationLabel);
    locationGroup.appendChild(locationButton);

    // Radius
    const radiusGroup = document.createElement('div');
    radiusGroup.style.display = 'flex';
    radiusGroup.style.flexDirection = 'column';
    radiusGroup.style.gap = '4px';

    const radiusLabel = document.createElement('label');
    radiusLabel.textContent = 'Check-In Radius (meters)';
    radiusLabel.style.fontWeight = '500';

    const radiusInput = document.createElement('input');
    radiusInput.type = 'range';
    radiusInput.min = MIN_CHECKIN_RADIUS;
    radiusInput.max = MAX_CHECKIN_RADIUS;
    radiusInput.value = DEFAULT_CHECKIN_RADIUS;
    radiusInput.style.width = '100%';

    const radiusValue = document.createElement('div');
    radiusValue.textContent = `${DEFAULT_CHECKIN_RADIUS}m`;
    radiusValue.style.textAlign = 'center';
    radiusValue.style.fontSize = '14px';

    radiusInput.oninput = () => {
        radiusValue.textContent = `${radiusInput.value}m`;
    };

    radiusGroup.appendChild(radiusLabel);
    radiusGroup.appendChild(radiusInput);
    radiusGroup.appendChild(radiusValue);

    form.appendChild(nameGroup);
    form.appendChild(subjectGroup);
    form.appendChild(scheduleGroup);
    form.appendChild(locationGroup);
    form.appendChild(radiusGroup);

    const modal = createModal('Create New Section', form, [{
            text: 'Cancel',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Create Section',
            action: async () => {
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }

                if (!locationButton.dataset.latitude) {
                    showToast('Please set a location for the section', 'error');
                    return;
                }

                try {
                    showLoading('Creating section...');

                    const sectionData = {
                        name: nameInput.value.trim(),
                        subject: subjectInput.value.trim(),
                        schedule: scheduleInput.value.trim(),
                        teacherId: currentUser.uid,
                        teacherName: currentUser.displayName || 'Teacher',
                        location: {
                            latitude: parseFloat(locationButton.dataset.latitude),
                            longitude: parseFloat(locationButton.dataset.longitude),
                            radius: parseInt(radiusInput.value)
                        },
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        students: [],
                        activeSession: null
                    };

                    const docRef = await db.collection('sections').add(sectionData);

                    showToast('Section created successfully!', 'success');
                    modal.close();
                    initTeacherDashboard();
                } catch (error) {
                    console.error('Create section error:', error);
                    showToast('Error creating section', 'error');
                } finally {
                    hideLoading();
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Show section details
function showStudentSectionDetails(sectionId, section) {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';

    // Section info
    const infoGroup = document.createElement('div');
    infoGroup.style.backgroundColor = 'var(--surface-color)';
    infoGroup.style.borderRadius = '12px';
    infoGroup.style.padding = '16px';

    infoGroup.innerHTML = `
        <h3 style="margin: 0 0 8px 0;">${section.name}</h3>
        <p style="margin: 0 0 4px 0; color: var(--text-secondary);">${section.subject}</p>
        <p style="margin: 0 0 12px 0; color: var(--text-secondary);">${section.schedule}</p>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <i class="fas fa-map-marker-alt" style="color: var(--primary-color);"></i>
            <span style="font-size: 14px;">${section.location.radius}m radius</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-users" style="color: var(--primary-color);"></i>
            <span style="font-size: 14px;">${section.students?.length || 0} students enrolled</span>
        </div>
    `;

    content.appendChild(infoGroup);

    // Session controls
    const sessionGroup = document.createElement('div');
    sessionGroup.style.backgroundColor = 'var(--surface-color)';
    sessionGroup.style.borderRadius = '12px';
    sessionGroup.style.padding = '16px';

    const isActive = section.activeSession &&
        new Date(section.activeSession.endTime.toDate()) > new Date();

    sessionGroup.innerHTML = `
        <h4 style="margin: 0 0 12px 0;">Session Controls</h4>
        ${isActive ? `
            <p style="margin: 0 0 16px 0; color: var(--text-secondary);">
                Session active until ${formatDate(section.activeSession.endTime)}
            </p>
            <button class="btn" style="background-color: #F44336; color: white; width: 100%;">
                End Session Now
            </button>
        ` : `
            <p style="margin: 0 0 16px 0; color: var(--text-secondary);">
                No active session
            </p>
            <button class="btn" style="background-color: var(--primary-color); color: white; width: 100%;">
                Start New Session
            </button>
        `}
    `;

    const sessionButton = sessionGroup.querySelector('button');
    sessionButton.onclick = async () => {
        if (isActive) {
            const confirm = await showConfirmation(
                'End Session',
                'Are you sure you want to end this session? Students will no longer be able to check in.',
                'End Session',
                'Cancel'
            );

            if (confirm) {
                try {
                    showLoading('Ending session...');
                    await db.collection('sections').doc(sectionId).update({
                        'activeSession': null
                    });

                    showToast('Session ended', 'success');
                    modal.close();
                    initTeacherDashboard();
                } catch (error) {
                    console.error('End session error:', error);
                    showToast('Error ending session', 'error');
                } finally {
                    hideLoading();
                }
            }
        } else {
            showStartSessionModal(sectionId, section);
        }
    };

    content.appendChild(sessionGroup);

    // Invite students
    const inviteGroup = document.createElement('div');
    inviteGroup.style.backgroundColor = 'var(--surface-color)';
    inviteGroup.style.borderRadius = '12px';
    inviteGroup.style.padding = '16px';

    inviteGroup.innerHTML = `
        <h4 style="margin: 0 0 12px 0;">Invite Students</h4>
        <p style="margin: 0 0 16px 0; color: var(--text-secondary);">
            Share this link or QR code with students to join your section
        </p>
        <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; gap: 8px;">
                <input type="text" id="inviteLink" value="${window.location.origin}/?join=${sectionId}" readonly style="flex: 1; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                <button class="btn" style="background-color: var(--primary-color); color: white;">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
            <button class="btn" style="background-color: var(--primary-color); color: white; width: 100%;">
                <i class="fas fa-qrcode"></i> Show QR Code
            </button>
        </div>
    `;

    const copyButton = inviteGroup.querySelector('.btn');
    copyButton.onclick = () => {
        const input = inviteGroup.querySelector('input');
        input.select();
        document.execCommand('copy');
        showToast('Link copied to clipboard', 'success');
    };

    const qrButton = inviteGroup.querySelectorAll('.btn')[1];
    qrButton.onclick = () => {
        showQRCodeModal(`${window.location.origin}/?join=${sectionId}`);
    };

    content.appendChild(inviteGroup);

    const modal = createModal(section.name, content, [{
            text: 'Close',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Manage Section',
            action: () => {
                modal.close();
                showSectionManagement(sectionId, section);
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Show section management
function showSectionManagement(sectionId, section) {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';

    // Tab navigation
    const tabs = document.createElement('div');
    tabs.style.display = 'flex';
    tabs.style.borderBottom = '1px solid var(--border-color)';
    tabs.style.marginBottom = '12px';

    const studentsTab = document.createElement('button');
    studentsTab.textContent = 'Students';
    studentsTab.className = 'tab-button active';
    studentsTab.style.flex = '1';
    studentsTab.style.padding = '12px';
    studentsTab.style.borderBottom = '2px solid var(--primary-color)';

    const attendanceTab = document.createElement('button');
    attendanceTab.textContent = 'Attendance';
    attendanceTab.className = 'tab-button';
    attendanceTab.style.flex = '1';
    attendanceTab.style.padding = '12px';

    tabs.appendChild(studentsTab);
    tabs.appendChild(attendanceTab);

    content.appendChild(tabs);

    // Tab content
    const tabContent = document.createElement('div');
    tabContent.style.minHeight = '300px';

    // Students tab content
    const studentsContent = document.createElement('div');
    studentsContent.className = 'tab-content active';

    // Search bar
    const searchBar = document.createElement('div');
    searchBar.style.display = 'flex';
    searchBar.style.gap = '8px';
    searchBar.style.marginBottom = '12px';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search students...';
    searchInput.style.flex = '1';
    searchInput.style.padding = '10px';
    searchInput.style.border = '1px solid var(--border-color)';
    searchInput.style.borderRadius = '8px';

    searchBar.appendChild(searchInput);
    studentsContent.appendChild(searchBar);

    // Students list
    const studentsList = document.createElement('div');
    studentsList.className = 'students-list';

    if (!section.students || section.students.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.style.textAlign = 'center';
        emptyState.style.padding = '32px 16px';
        emptyState.style.color = 'var(--text-secondary)';

        emptyState.innerHTML = `
            <i class="fas fa-user-graduate" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
            <p style="margin: 0;">No students enrolled yet.</p>
            <p style="margin: 8px 0 0 0; font-size: 14px;">Share the invite link to add students</p>
        `;

        studentsList.appendChild(emptyState);
    } else {
        // Load student details
        Promise.all(section.students.map(studentId =>
            db.collection('users').doc(studentId).get()
        )).then(studentDocs => {
            studentDocs.forEach(doc => {
                if (doc.exists) {
                    const student = doc.data();

                    const studentItem = document.createElement('div');
                    studentItem.className = 'student-item';
                    studentItem.style.display = 'flex';
                    studentItem.style.alignItems = 'center';
                    studentItem.style.padding = '12px';
                    studentItem.style.borderBottom = '1px solid var(--border-color)';
                    studentItem.style.gap = '12px';

                    // Avatar
                    const avatar = document.createElement('div');
                    avatar.className = 'avatar';
                    avatar.style.backgroundColor = student.avatar?.bgColor || getRandomColor();
                    avatar.style.width = '40px';
                    avatar.style.height = '40px';
                    avatar.style.borderRadius = '50%';
                    avatar.style.display = 'flex';
                    avatar.style.justifyContent = 'center';
                    avatar.style.alignItems = 'center';
                    avatar.style.fontSize = '16px';
                    avatar.textContent = student.avatar?.emoji + student.avatar?.text;

                    // Student info
                    const studentInfo = document.createElement('div');
                    studentInfo.style.flex = '1';

                    studentInfo.innerHTML = `
                        <p style="margin: 0; font-weight: 500;">${student.fullName}</p>
                        <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-secondary);">${student.username}</p>
                    `;

                    // Actions menu
                    const actionsButton = document.createElement('button');
                    actionsButton.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
                    actionsButton.className = 'icon-button';
                    actionsButton.onclick = (e) => {
                        e.stopPropagation();
                        showStudentActionsMenu(sectionId, student.uid, student.fullName);
                    };

                    studentItem.appendChild(avatar);
                    studentItem.appendChild(studentInfo);
                    studentItem.appendChild(actionsButton);

                    studentsList.appendChild(studentItem);
                }
            });
        });
    }

    studentsContent.appendChild(studentsList);
    tabContent.appendChild(studentsContent);

    // Attendance tab content
    const attendanceContent = document.createElement('div');
    attendanceContent.className = 'tab-content';
    attendanceContent.style.display = 'none';

    // Date selector
    const dateGroup = document.createElement('div');
    dateGroup.style.display = 'flex';
    dateGroup.style.gap = '8px';
    dateGroup.style.marginBottom = '12px';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.style.flex = '1';
    dateInput.style.padding = '10px';
    dateInput.style.border = '1px solid var(--border-color)';
    dateInput.style.borderRadius = '8px';

    dateGroup.appendChild(dateInput);
    attendanceContent.appendChild(dateGroup);

    // Attendance summary
    const summary = document.createElement('div');
    summary.style.backgroundColor = 'var(--surface-color)';
    summary.style.borderRadius = '12px';
    summary.style.padding = '16px';
    summary.style.marginBottom = '12px';

    summary.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <span style="font-weight: 500;">Attendance Summary</span>
            <span style="color: var(--text-secondary);">${new Date().toLocaleDateString()}</span>
        </div>
        <div style="display: flex; gap: 12px; text-align: center;">
            <div style="flex: 1;">
                <div style="font-size: 24px; font-weight: 600; color: #4CAF50;">0</div>
                <div style="font-size: 12px; color: var(--text-secondary);">Present</div>
            </div>
            <div style="flex: 1;">
                <div style="font-size: 24px; font-weight: 600; color: #F44336;">0</div>
                <div style="font-size: 12px; color: var(--text-secondary);">Absent</div>
            </div>
            <div style="flex: 1;">
                <div style="font-size: 24px; font-weight: 600; color: #FF9800;">0</div>
                <div style="font-size: 12px; color: var(--text-secondary);">Late</div>
            </div>
        </div>
    `;

    attendanceContent.appendChild(summary);

    // Attendance list
    const attendanceList = document.createElement('div');
    attendanceList.className = 'attendance-list';

    const emptyState = document.createElement('div');
    emptyState.style.textAlign = 'center';
    emptyState.style.padding = '32px 16px';
    emptyState.style.color = 'var(--text-secondary)';

    emptyState.innerHTML = `
        <i class="fas fa-calendar-check" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
        <p style="margin: 0;">No attendance records yet.</p>
    `;

    attendanceList.appendChild(emptyState);
    attendanceContent.appendChild(attendanceList);
    tabContent.appendChild(attendanceContent);

    // Tab switching
    studentsTab.onclick = () => {
        studentsTab.classList.add('active');
        attendanceTab.classList.remove('active');
        studentsContent.style.display = 'block';
        attendanceContent.style.display = 'none';
    };

    attendanceTab.onclick = () => {
        attendanceTab.classList.add('active');
        studentsTab.classList.remove('active');
        attendanceContent.style.display = 'block';
        studentsContent.style.display = 'none';
    };

    content.appendChild(tabContent);

    const modal = createModal(`Manage ${section.name}`, content, [{
            text: 'Close',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Delete Section',
            action: async () => {
                const confirm = await showConfirmation(
                    'Delete Section',
                    'Are you sure you want to delete this section? This action cannot be undone.',
                    'Delete',
                    'Cancel'
                );

                if (confirm) {
                    try {
                        showLoading('Deleting section...');
                        await db.collection('sections').doc(sectionId).delete();
                        showToast('Section deleted', 'success');
                        modal.close();
                        initTeacherDashboard();
                    } catch (error) {
                        console.error('Delete section error:', error);
                        showToast('Error deleting section', 'error');
                    } finally {
                        hideLoading();
                    }
                }
            },
            style: {
                background: '#F44336',
                color: 'white'
            }
        }
    ]);
}

// Show student actions menu
function showStudentActionsMenu(sectionId, studentId, studentName) {
    const menuContent = document.createElement('div');
    menuContent.style.padding = '8px 0';

    const actions = [{
            icon: 'fas fa-check',
            text: 'Mark as Present',
            action: () => markAttendance(sectionId, studentId, 'present')
        },
        {
            icon: 'fas fa-times',
            text: 'Mark as Absent',
            action: () => markAttendance(sectionId, studentId, 'absent')
        },
        {
            icon: 'fas fa-clock',
            text: 'Mark as Late',
            action: () => markAttendance(sectionId, studentId, 'late')
        },
        {
            icon: 'fas fa-user-clock',
            text: 'Mark as Excused',
            action: () => markAttendance(sectionId, studentId, 'excused')
        },
        {
            icon: 'fas fa-chart-bar',
            text: 'View Attendance',
            action: () => viewStudentAttendance(sectionId, studentId)
        },
        {
            icon: 'fas fa-user-minus',
            text: 'Remove from Section',
            action: () => removeStudent(sectionId, studentId, studentName)
        }
    ];

    actions.forEach(action => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.padding = '12px 16px';
        item.style.cursor = 'pointer';

        item.innerHTML = `
            <i class="${action.icon}" style="margin-right: 12px; width: 24px; text-align: center;"></i>
            <span>${action.text}</span>
        `;

        item.onclick = () => {
            action.action();
            document.querySelector('.modal-overlay')?.remove();
        };

        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'var(--secondary-color)';
        });

        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'transparent';
        });

        menuContent.appendChild(item);
    });

    createModal(`Student: ${studentName}`, menuContent, [], {
        fullScreen: false
    });
}

// Mark student attendance
async function markAttendance(sectionId, studentId, status) {
    try {
        showLoading('Updating attendance...');

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Update attendance record
        await db.collection('attendance').doc(`${sectionId}_${studentId}_${today.getTime()}`).set({
            sectionId: sectionId,
            studentId: studentId,
            date: today,
            status: status,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            markedBy: currentUser.uid
        }, {
            merge: true
        });

        showToast(`Marked as ${status}`, 'success');
    } catch (error) {
        console.error('Mark attendance error:', error);
        showToast('Error updating attendance', 'error');
    } finally {
        hideLoading();
    }
}

// View student attendance
async function viewStudentAttendance(sectionId, studentId) {
    try {
        showLoading('Loading attendance...');

        const studentDoc = await db.collection('users').doc(studentId).get();
        if (!studentDoc.exists) {
            showToast('Student not found', 'error');
            return;
        }

        const student = studentDoc.data();

        // Get attendance records
        const attendanceSnapshot = await db.collection('attendance')
            .where('sectionId', '==', sectionId)
            .where('studentId', '==', studentId)
            .orderBy('date', 'desc')
            .limit(30)
            .get();

        const content = document.createElement('div');
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
        content.style.gap = '16px';

        // Student info
        const infoGroup = document.createElement('div');
        infoGroup.style.display = 'flex';
        infoGroup.style.alignItems = 'center';
        infoGroup.style.gap = '12px';
        infoGroup.style.marginBottom = '12px';

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.style.backgroundColor = student.avatar?.bgColor || getRandomColor();
        avatar.style.width = '48px';
        avatar.style.height = '48px';
        avatar.style.borderRadius = '50%';
        avatar.style.display = 'flex';
        avatar.style.justifyContent = 'center';
        avatar.style.alignItems = 'center';
        avatar.style.fontSize = '20px';
        avatar.textContent = student.avatar?.emoji + student.avatar?.text;

        const studentInfo = document.createElement('div');
        studentInfo.innerHTML = `
            <h3 style="margin: 0; font-size: 18px;">${student.fullName}</h3>
            <p style="margin: 4px 0 0 0; font-size: 14px; color: var(--text-secondary);">${student.username}</p>
        `;

        infoGroup.appendChild(avatar);
        infoGroup.appendChild(studentInfo);
        content.appendChild(infoGroup);

        // Attendance summary
        const summaryGroup = document.createElement('div');
        summaryGroup.style.display = 'flex';
        summaryGroup.style.justifyContent = 'space-between';
        summaryGroup.style.gap = '12px';
        summaryGroup.style.marginBottom = '12px';

        const summaryItems = [{
                status: 'present',
                color: '#4CAF50',
                icon: 'fas fa-check'
            },
            {
                status: 'absent',
                color: '#F44336',
                icon: 'fas fa-times'
            },
            {
                status: 'late',
                color: '#FF9800',
                icon: 'fas fa-clock'
            },
            {
                status: 'excused',
                color: '#9C27B0',
                icon: 'fas fa-user-clock'
            }
        ];

        summaryItems.forEach(item => {
            const count = attendanceSnapshot.docs.filter(doc => doc.data().status === item.status).length;

            const summaryItem = document.createElement('div');
            summaryItem.style.flex = '1';
            summaryItem.style.textAlign = 'center';
            summaryItem.style.backgroundColor = 'var(--surface-color)';
            summaryItem.style.borderRadius = '8px';
            summaryItem.style.padding = '12px';

            summaryItem.innerHTML = `
                <div style="font-size: 24px; font-weight: 600; color: ${item.color};">${count}</div>
                <div style="font-size: 12px; color: var(--text-secondary); text-transform: capitalize;">${item.status}</div>
            `;

            summaryGroup.appendChild(summaryItem);
        });

        content.appendChild(summaryGroup);

        // Attendance list
        const listHeader = document.createElement('h4');
        listHeader.textContent = 'Recent Attendance';
        listHeader.style.margin = '0 0 8px 0';

        content.appendChild(listHeader);

        const attendanceList = document.createElement('div');
        attendanceList.className = 'attendance-list';

        if (attendanceSnapshot.empty) {
            const emptyState = document.createElement('div');
            emptyState.style.textAlign = 'center';
            emptyState.style.padding = '32px 16px';
            emptyState.style.color = 'var(--text-secondary)';

            emptyState.innerHTML = `
                <i class="fas fa-calendar-times" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p style="margin: 0;">No attendance records found.</p>
            `;

            attendanceList.appendChild(emptyState);
        } else {
            attendanceSnapshot.forEach(doc => {
                const record = doc.data();

                const listItem = document.createElement('div');
                listItem.style.display = 'flex';
                listItem.style.justifyContent = 'space-between';
                listItem.style.alignItems = 'center';
                listItem.style.padding = '12px 0';
                listItem.style.borderBottom = '1px solid var(--border-color)';

                let statusColor = '#2196F3';
                if (record.status === 'present') statusColor = '#4CAF50';
                else if (record.status === 'absent') statusColor = '#F44336';
                else if (record.status === 'late') statusColor = '#FF9800';
                else if (record.status === 'excused') statusColor = '#9C27B0';

                listItem.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusColor};"></div>
                        <span style="text-transform: capitalize;">${record.status}</span>
                    </div>
                    <span style="font-size: 14px; color: var(--text-secondary);">${formatDate(record.date, false)}</span>
                `;

                attendanceList.appendChild(listItem);
            });
        }

        content.appendChild(attendanceList);

        createModal('Attendance Record', content, [{
            text: 'Close',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        }]);
    } catch (error) {
        console.error('View attendance error:', error);
        showToast('Error loading attendance', 'error');
    } finally {
        hideLoading();
    }
}

// Remove student from section
async function removeStudent(sectionId, studentId, studentName) {
    const confirm = await showConfirmation(
        'Remove Student',
        `Are you sure you want to remove ${studentName} from this section?`,
        'Remove',
        'Cancel'
    );

    if (confirm) {
        try {
            showLoading('Removing student...');

            // Remove student from section
            await db.collection('sections').doc(sectionId).update({
                students: firebase.firestore.FieldValue.arrayRemove(studentId)
            });

            // Remove student's enrollments
            await db.collection('enrollments').doc(`${studentId}_${sectionId}`).delete();

            showToast('Student removed', 'success');
            initTeacherDashboard();
        } catch (error) {
            console.error('Remove student error:', error);
            showToast('Error removing student', 'error');
        } finally {
            hideLoading();
        }
    }
}

// Show start session modal
function showStartSessionModal(sectionId, section) {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';

    // Session duration
    const durationGroup = document.createElement('div');
    durationGroup.style.display = 'flex';
    durationGroup.style.flexDirection = 'column';
    durationGroup.style.gap = '4px';

    const durationLabel = document.createElement('label');
    durationLabel.textContent = 'Session Duration';
    durationLabel.style.fontWeight = '500';

    const durationSelect = document.createElement('select');
    durationSelect.style.padding = '12px';
    durationSelect.style.border = '1px solid var(--border-color)';
    durationSelect.style.borderRadius = '8px';
    durationSelect.style.backgroundColor = 'var(--background-color)';
    durationSelect.style.color = 'var(--text-color)';

    const durations = [{
            value: 30,
            text: '30 minutes'
        },
        {
            value: 60,
            text: '1 hour'
        },
        {
            value: 90,
            text: '1.5 hours'
        },
        {
            value: 120,
            text: '2 hours'
        },
        {
            value: 180,
            text: '3 hours'
        }
    ];

    durations.forEach(duration => {
        const option = document.createElement('option');
        option.value = duration.value;
        option.textContent = duration.text;
        durationSelect.appendChild(option);
    });

    durationGroup.appendChild(durationLabel);
    durationGroup.appendChild(durationSelect);
    content.appendChild(durationGroup);

    // Location options
    const locationGroup = document.createElement('div');
    locationGroup.style.display = 'flex';
    locationGroup.style.flexDirection = 'column';
    locationGroup.style.gap = '4px';

    const locationLabel = document.createElement('label');
    locationLabel.textContent = 'Location';
    locationLabel.style.fontWeight = '500';

    const locationOptions = document.createElement('div');
    locationOptions.style.display = 'flex';
    locationOptions.style.flexDirection = 'column';
    locationOptions.style.gap = '8px';

    const defaultLocationOption = document.createElement('div');
    defaultLocationOption.style.display = 'flex';
    defaultLocationOption.style.alignItems = 'center';
    defaultLocationOption.style.gap = '8px';

    const defaultRadio = document.createElement('input');
    defaultRadio.type = 'radio';
    defaultRadio.name = 'location';
    defaultRadio.id = 'defaultLocation';
    defaultRadio.value = 'default';
    defaultRadio.checked = true;

    const defaultLabel = document.createElement('label');
    defaultLabel.htmlFor = 'defaultLocation';
    defaultLabel.textContent = 'Use default section location';
    defaultLabel.style.flex = '1';

    defaultLocationOption.appendChild(defaultRadio);
    defaultLocationOption.appendChild(defaultLabel);

    const currentLocationOption = document.createElement('div');
    currentLocationOption.style.display = 'flex';
    currentLocationOption.style.alignItems = 'center';
    currentLocationOption.style.gap = '8px';

    const currentRadio = document.createElement('input');
    currentRadio.type = 'radio';
    currentRadio.name = 'location';
    currentRadio.id = 'currentLocation';
    currentRadio.value = 'current';

    const currentLabel = document.createElement('label');
    currentLabel.htmlFor = 'currentLocation';
    currentLabel.textContent = 'Use my current location';
    currentLabel.style.flex = '1';

    currentLocationOption.appendChild(currentRadio);
    currentLocationOption.appendChild(currentLabel);

    locationOptions.appendChild(defaultLocationOption);
    locationOptions.appendChild(currentLocationOption);

    locationGroup.appendChild(locationLabel);
    locationGroup.appendChild(locationOptions);
    content.appendChild(locationGroup);

    // Radius
    const radiusGroup = document.createElement('div');
    radiusGroup.style.display = 'flex';
    radiusGroup.style.flexDirection = 'column';
    radiusGroup.style.gap = '4px';

    const radiusLabel = document.createElement('label');
    radiusLabel.textContent = 'Check-In Radius (meters)';
    radiusLabel.style.fontWeight = '500';

    const radiusInput = document.createElement('input');
    radiusInput.type = 'range';
    radiusInput.min = MIN_CHECKIN_RADIUS;
    radiusInput.max = MAX_CHECKIN_RADIUS;
    radiusInput.value = section.location?.radius || DEFAULT_CHECKIN_RADIUS;
    radiusInput.style.width = '100%';

    const radiusValue = document.createElement('div');
    radiusValue.textContent = `${radiusInput.value}m`;
    radiusValue.style.textAlign = 'center';
    radiusValue.style.fontSize = '14px';

    radiusInput.oninput = () => {
        radiusValue.textContent = `${radiusInput.value}m`;
    };

    radiusGroup.appendChild(radiusLabel);
    radiusGroup.appendChild(radiusInput);
    radiusGroup.appendChild(radiusValue);
    content.appendChild(radiusGroup);

    // SilentScan option
    const silentScanGroup = document.createElement('div');
    silentScanGroup.style.display = 'flex';
    silentScanGroup.style.alignItems = 'center';
    silentScanGroup.style.gap = '8px';

    const silentScanCheckbox = document.createElement('input');
    silentScanCheckbox.type = 'checkbox';
    silentScanCheckbox.id = 'silentScan';
    silentScanCheckbox.checked = true;

    const silentScanLabel = document.createElement('label');
    silentScanLabel.htmlFor = 'silentScan';
    silentScanLabel.textContent = 'Enable SilentScan (no notifications)';
    silentScanLabel.style.flex = '1';

    silentScanGroup.appendChild(silentScanCheckbox);
    silentScanGroup.appendChild(silentScanLabel);
    content.appendChild(silentScanGroup);

    const modal = createModal('Start New Session', content, [{
            text: 'Cancel',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Start Session',
            action: async () => {
                try {
                    showLoading('Starting session...');

                    let location = {
                        latitude: section.location.latitude,
                        longitude: section.location.longitude,
                        radius: parseInt(radiusInput.value)
                    };

                    // If current location selected, get it
                    if (currentRadio.checked) {
                        const position = await getCurrentPosition();
                        location = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            radius: parseInt(radiusInput.value)
                        };
                    }

                    const durationMinutes = parseInt(durationSelect.value);
                    const now = new Date();
                    const endTime = new Date(now.getTime() + durationMinutes * 60000);

                    const sessionData = {
                        startTime: now,
                        endTime: endTime,
                        location: location,
                        silentScan: silentScanCheckbox.checked
                    };

                    await db.collection('sections').doc(sectionId).update({
                        activeSession: sessionData
                    });

                    showToast('Session started', 'success');
                    modal.close();
                    initTeacherDashboard();
                } catch (error) {
                    console.error('Start session error:', error);
                    showToast('Error starting session', 'error');
                } finally {
                    hideLoading();
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Show QR code modal
function showQRCodeModal(text) {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.alignItems = 'center';
    content.style.gap = '16px';
    content.style.padding = '16px';

    // Generate QR code using free API
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`;

    const qrCodeImg = document.createElement('img');
    qrCodeImg.src = qrCodeUrl;
    qrCodeImg.alt = 'QR Code';
    qrCodeImg.style.width = '200px';
    qrCodeImg.style.height = '200px';

    const linkText = document.createElement('p');
    linkText.textContent = text;
    linkText.style.wordBreak = 'break-all';
    linkText.style.textAlign = 'center';
    linkText.style.margin = '0';

    content.appendChild(qrCodeImg);
    content.appendChild(linkText);

    createModal('Scan to Join', content, [{
            text: 'Close',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Download',
            action: () => {
                const link = document.createElement('a');
                link.href = qrCodeUrl;
                link.download = 'NearCheck-Section-QR.png';
                link.click();
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Load teacher summary data
async function loadTeacherSummaryData() {
    try {
        // TODO: Implement actual data loading for summaries
    } catch (error) {
        console.error('Load summary error:', error);
    }
}

// =============================================
// Student-Specific Functions
// =============================================

// Initialize student dashboard
async function initStudentDashboard() {
    // Clear existing content
    const app = document.getElementById('app');
    app.innerHTML = '';

    // Create dashboard structure
    const dashboard = document.createElement('div');
    dashboard.className = 'dashboard student-dashboard';
    dashboard.style.display = 'flex';
    dashboard.style.flexDirection = 'column';
    dashboard.style.height = '100vh';
    dashboard.style.overflow = 'hidden';

    // Create header
    const header = document.createElement('header');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.padding = '16px';
    header.style.backgroundColor = 'var(--surface-color)';
    header.style.borderBottom = '1px solid var(--border-color)';

    const headerLeft = document.createElement('div');
    headerLeft.style.display = 'flex';
    headerLeft.style.alignItems = 'center';
    headerLeft.style.gap = '12px';

    const menuButton = document.createElement('button');
    menuButton.innerHTML = '<i class="fas fa-bars"></i>';
    menuButton.className = 'icon-button';
    menuButton.onclick = showStudentMenu;

    const title = document.createElement('h1');
    title.textContent = 'Student Dashboard';
    title.style.margin = '0';
    title.style.fontSize = '20px';
    title.style.fontWeight = '600';

    headerLeft.appendChild(menuButton);
    headerLeft.appendChild(title);

    const headerRight = document.createElement('div');
    headerRight.style.display = 'flex';
    headerRight.style.alignItems = 'center';
    headerRight.style.gap = '12px';

    const notificationButton = document.createElement('button');
    notificationButton.innerHTML = '<i class="fas fa-bell"></i>';
    notificationButton.className = 'icon-button';
    notificationButton.onclick = showNotifications;

    const profileButton = document.createElement('button');
    profileButton.className = 'avatar-button';
    profileButton.onclick = showProfileMenu;

    // Load user avatar
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) {
        const userData = userDoc.data();
        profileButton.innerHTML = `
            <div class="avatar" style="background-color: ${userData.avatar?.bgColor || '#1976D2'}">
                ${userData.avatar?.emoji || '👤'}${userData.avatar?.text || ''}
            </div>
        `;
    }

    headerRight.appendChild(notificationButton);
    headerRight.appendChild(profileButton);

    header.appendChild(headerLeft);
    header.appendChild(headerRight);

    // Create main content area
    const mainContent = document.createElement('main');
    mainContent.style.flex = '1';
    mainContent.style.overflowY = 'auto';
    mainContent.style.padding = '16px';

    // Add greeting based on time of day
    const greeting = document.createElement('div');
    greeting.className = 'greeting';

    const now = new Date();
    const hour = now.getHours();
    let greetingText = 'Good ';

    if (hour < 12) greetingText += 'Morning';
    else if (hour < 18) greetingText += 'Afternoon';
    else greetingText += 'Evening';

    greeting.innerHTML = `
        <h2 style="margin: 0 0 8px 0;">${greetingText}, ${userDoc.data().fullName.split(' ')[0]}</h2>
        <p style="margin: 0; color: var(--text-secondary);">${formatDate(now, false)}</p>
    `;

    mainContent.appendChild(greeting);

    // Add sections carousel
    const sectionsHeader = document.createElement('div');
    sectionsHeader.style.display = 'flex';
    sectionsHeader.style.justifyContent = 'space-between';
    sectionsHeader.style.alignItems = 'center';
    sectionsHeader.style.margin = '24px 0 12px 0';

    const sectionsTitle = document.createElement('h3');
    sectionsTitle.textContent = 'Your Sections';
    sectionsTitle.style.margin = '0';

    const joinSectionButton = document.createElement('button');
    joinSectionButton.textContent = '+ Join';
    joinSectionButton.className = 'text-button';
    joinSectionButton.style.color = 'var(--primary-color)';
    joinSectionButton.onclick = showJoinSectionModal;

    sectionsHeader.appendChild(sectionsTitle);
    sectionsHeader.appendChild(joinSectionButton);

    mainContent.appendChild(sectionsHeader);

    const sectionsCarousel = document.createElement('div');
    sectionsCarousel.className = 'carousel';
    sectionsCarousel.style.display = 'flex';
    sectionsCarousel.style.gap = '12px';
    sectionsCarousel.style.overflowX = 'auto';
    sectionsCarousel.style.paddingBottom = '8px';
    sectionsCarousel.style.scrollSnapType = 'x mandatory';

    // Load student's enrolled sections
    const enrollmentsSnapshot = await db.collection('enrollments')
        .where('studentId', '==', currentUser.uid)
        .get();

    if (enrollmentsSnapshot.empty) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.style.textAlign = 'center';
        emptyState.style.padding = '32px 16px';
        emptyState.style.color = 'var(--text-secondary)';

        emptyState.innerHTML = `
            <i class="fas fa-chalkboard" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
            <p style="margin: 0;">You haven't joined any sections yet.</p>
            <button class="text-button" style="margin-top: 8px; color: var(--primary-color);" onclick="showJoinSectionModal()">
                Join a section
            </button>
        `;

        sectionsCarousel.appendChild(emptyState);
    } else {
        enrolledSections = [];

        // Get section details for each enrollment
        const sectionPromises = enrollmentsSnapshot.docs.map(doc =>
            db.collection('sections').doc(doc.data().sectionId).get()
        );

        const sectionDocs = await Promise.all(sectionPromises);

        sectionDocs.forEach(doc => {
            if (doc.exists) {
                const section = doc.data();
                const sectionId = doc.id;
                enrolledSections.push({
                    sectionId,
                    ...section
                });

                const sectionCard = document.createElement('div');
                sectionCard.className = 'section-card';
                sectionCard.style.minWidth = '280px';
                sectionCard.style.scrollSnapAlign = 'start';
                sectionCard.style.backgroundColor = 'var(--surface-color)';
                sectionCard.style.borderRadius = '12px';
                sectionCard.style.padding = '16px';
                sectionCard.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                sectionCard.style.position = 'relative';
                sectionCard.style.overflow = 'hidden';

                // Check if this section has an active session
                const isActive = section.activeSession &&
                    new Date(section.activeSession.endTime.toDate()) > new Date();

                if (isActive) {
                    sectionCard.style.borderLeft = '4px solid var(--primary-color)';
                }

                sectionCard.innerHTML = `
                    <h3 style="margin: 0 0 8px 0; font-size: 16px;">${section.name}</h3>
                    <p style="margin: 0 0 4px 0; font-size: 14px; color: var(--text-secondary);">${section.subject}</p>
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: var(--text-secondary);">
                        ${section.schedule}
                    </p>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 12px; color: var(--text-secondary);">
                            ${section.teacherName}
                        </span>
                        <button class="text-button" style="color: var(--primary-color);">
                            ${isActive ? 'Check In' : 'Details'}
                        </button>
                    </div>
                `;

                // Add click handler to button
                const actionButton = sectionCard.querySelector('button');
                actionButton.onclick = (e) => {
                    e.stopPropagation();
                    if (isActive) {
                        checkInToSection(sectionId, section);
                    } else {
                        showSectionDetails(sectionId, section);
                    }
                };

                // Add click handler to entire card
                sectionCard.onclick = () => {
                    showStudentSectionDetails(sectionId, section);
                };

                sectionsCarousel.appendChild(sectionCard);
            }
        });
    }

    mainContent.appendChild(sectionsCarousel);

    // Add attendance summary
    const summaryHeader = document.createElement('div');
    summaryHeader.style.display = 'flex';
    summaryHeader.style.justifyContent = 'space-between';
    summaryHeader.style.alignItems = 'center';
    summaryHeader.style.margin = '24px 0 12px 0';

    const summaryTitle = document.createElement('h3');
    summaryTitle.textContent = 'Your Attendance';
    summaryTitle.style.margin = '0';

    const viewAllButton = document.createElement('button');
    viewAllButton.textContent = 'View All';
    viewAllButton.className = 'text-button';
    viewAllButton.style.color = 'var(--primary-color)';
    viewAllButton.onclick = showAllAttendance;

    summaryHeader.appendChild(summaryTitle);
    summaryHeader.appendChild(viewAllButton);

    mainContent.appendChild(summaryHeader);

    const summaryCards = document.createElement('div');
    summaryCards.style.display = 'grid';
    summaryCards.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
    summaryCards.style.gap = '12px';
    summaryCards.style.marginBottom = '24px';

    // Add summary cards (placeholder for now)
    const summaries = [{
            title: 'Present',
            value: '0',
            icon: 'fas fa-check',
            color: '#4CAF50'
        },
        {
            title: 'Absent',
            value: '0',
            icon: 'fas fa-times',
            color: '#F44336'
        },
        {
            title: 'Late',
            value: '0',
            icon: 'fas fa-clock',
            color: '#FF9800'
        },
        {
            title: 'Sections',
            value: enrolledSections.length,
            icon: 'fas fa-chalkboard',
            color: '#2196F3'
        }
    ];

    summaries.forEach(item => {
        const card = document.createElement('div');
        card.className = 'summary-card';
        card.style.backgroundColor = 'var(--surface-color)';
        card.style.borderRadius = '12px';
        card.style.padding = '16px';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 14px; color: var(--text-secondary);">${item.title}</span>
                <i class="${item.icon}" style="color: ${item.color};"></i>
            </div>
            <div style="font-size: 24px; font-weight: 600;">${item.value}</div>
        `;

        summaryCards.appendChild(card);
    });

    mainContent.appendChild(summaryCards);

    // Add recent activity
    const activityHeader = document.createElement('h3');
    activityHeader.textContent = 'Recent Check-Ins';
    activityHeader.style.margin = '24px 0 12px 0';

    mainContent.appendChild(activityHeader);

    const activityList = document.createElement('div');
    activityList.className = 'activity-list';

    // Add placeholder activity items
    const activities = [{
            text: 'Checked in to Section A',
            time: '2 hours ago',
            status: 'present'
        },
        {
            text: 'Marked absent in Section B',
            time: '1 day ago',
            status: 'absent'
        },
        {
            text: 'Checked in late to Section C',
            time: '3 days ago',
            status: 'late'
        }
    ];

    activities.forEach(activity => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '12px 0';
        item.style.borderBottom = '1px solid var(--border-color)';

        let statusColor = '#2196F3';
        if (activity.status === 'present') statusColor = '#4CAF50';
        else if (activity.status === 'absent') statusColor = '#F44336';
        else if (activity.status === 'late') statusColor = '#FF9800';

        item.innerHTML = `
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusColor};"></div>
                    <p style="margin: 0; font-size: 14px;">${activity.text}</p>
                </div>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-secondary);">${activity.time}</p>
            </div>
            <i class="fas fa-chevron-right" style="color: var(--text-secondary);"></i>
        `;

        activityList.appendChild(item);
    });

    mainContent.appendChild(activityList);

    // Add footer
    const footer = document.createElement('footer');
    footer.style.padding = '12px 16px';
    footer.style.backgroundColor = 'var(--surface-color)';
    footer.style.borderTop = '1px solid var(--border-color)';
    footer.style.textAlign = 'center';
    footer.style.fontSize = '12px';
    footer.style.color = 'var(--text-secondary)';
    footer.textContent = `NearCheck Lite v${APP_VERSION}`;

    dashboard.appendChild(header);
    dashboard.appendChild(mainContent);
    dashboard.appendChild(footer);

    app.appendChild(dashboard);

    // Load real data for summaries and activities
    loadStudentSummaryData();
}

// Show student menu
function showStudentMenu() {
    const menuItems = [{
            icon: 'fas fa-home',
            text: 'Dashboard',
            action: initStudentDashboard
        },
        {
            icon: 'fas fa-calendar-alt',
            text: 'Attendance',
            action: showAttendanceReports
        },
        {
            icon: 'fas fa-cog',
            text: 'Settings',
            action: showSettings
        },
        {
            icon: 'fas fa-question-circle',
            text: 'Help & Support',
            action: showHelp
        },
        {
            icon: 'fas fa-sign-out-alt',
            text: 'Sign Out',
            action: signOut
        }
    ];

    const menuContent = document.createElement('div');
    menuContent.style.padding = '16px 0';

    menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item';
        menuItem.style.display = 'flex';
        menuItem.style.alignItems = 'center';
        menuItem.style.padding = '12px 16px';
        menuItem.style.cursor = 'pointer';

        menuItem.innerHTML = `
            <i class="${item.icon}" style="margin-right: 12px; width: 24px; text-align: center;"></i>
            <span>${item.text}</span>
        `;

        menuItem.onclick = item.action;

        menuItem.addEventListener('mouseenter', () => {
            menuItem.style.backgroundColor = 'var(--secondary-color)';
        });

        menuItem.addEventListener('mouseleave', () => {
            menuItem.style.backgroundColor = 'transparent';
        });

        menuContent.appendChild(menuItem);
    });

    createModal('Menu', menuContent, [], {
        fullScreen: true
    });
}

// Show join section modal
function showJoinSectionModal() {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';

    // Join via link
    const linkGroup = document.createElement('div');
    linkGroup.style.display = 'flex';
    linkGroup.style.flexDirection = 'column';
    linkGroup.style.gap = '8px';

    const linkLabel = document.createElement('label');
    linkLabel.textContent = 'Invitation Link';
    linkLabel.style.fontWeight = '500';

    const linkInput = document.createElement('input');
    linkInput.type = 'text';
    linkInput.placeholder = 'Paste invitation link here';
    linkInput.style.padding = '12px';
    linkInput.style.border = '1px solid var(--border-color)';
    linkInput.style.borderRadius = '8px';

    linkGroup.appendChild(linkLabel);
    linkGroup.appendChild(linkInput);
    content.appendChild(linkGroup);

    // OR divider
    const divider = document.createElement('div');
    divider.style.display = 'flex';
    divider.style.alignItems = 'center';
    divider.style.gap = '8px';
    divider.style.margin = '8px 0';

    const line1 = document.createElement('div');
    line1.style.flex = '1';
    line1.style.height = '1px';
    line1.style.backgroundColor = 'var(--border-color)';

    const orText = document.createElement('span');
    orText.textContent = 'OR';
    orText.style.fontSize = '12px';
    orText.style.color = 'var(--text-secondary)';

    const line2 = document.createElement('div');
    line2.style.flex = '1';
    line2.style.height = '1px';
    line2.style.backgroundColor = 'var(--border-color)';

    divider.appendChild(line1);
    divider.appendChild(orText);
    divider.appendChild(line2);
    content.appendChild(divider);

    // Join via section ID
    const idGroup = document.createElement('div');
    idGroup.style.display = 'flex';
    idGroup.style.flexDirection = 'column';
    idGroup.style.gap = '8px';

    const idLabel = document.createElement('label');
    idLabel.textContent = 'Section ID';
    idLabel.style.fontWeight = '500';

    const idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.placeholder = 'Enter section ID';
    idInput.style.padding = '12px';
    idInput.style.border = '1px solid var(--border-color)';
    idInput.style.borderRadius = '8px';

    idGroup.appendChild(idLabel);
    idGroup.appendChild(idInput);
    content.appendChild(idGroup);

    const modal = createModal('Join Section', content, [{
            text: 'Cancel',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Join Section',
            action: async () => {
                let sectionId = '';

                // Extract section ID from link if provided
                if (linkInput.value) {
                    const url = new URL(linkInput.value);
                    sectionId = url.searchParams.get('join') || '';
                } else if (idInput.value) {
                    sectionId = idInput.value.trim();
                }

                if (!sectionId) {
                    showToast('Please enter a valid link or section ID', 'error');
                    return;
                }

                try {
                    showLoading('Joining section...');
                    await enrollInSection(sectionId, currentUser.uid);
                    showToast('Section joined successfully!', 'success');
                    modal.close();
                    initStudentDashboard();
                } catch (error) {
                    console.error('Join section error:', error);
                    showToast('Error joining section', 'error');
                } finally {
                    hideLoading();
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Enroll student in a section
async function enrollInSection(sectionId, studentId) {
    try {
        // Check if section exists
        const sectionDoc = await db.collection('sections').doc(sectionId).get();
        if (!sectionDoc.exists) {
            throw new Error('Section not found');
        }

        // Check if already enrolled
        const enrollmentDoc = await db.collection('enrollments').doc(`${studentId}_${sectionId}`).get();
        if (enrollmentDoc.exists) {
            throw new Error('Already enrolled in this section');
        }

        // Add student to section
        await db.collection('sections').doc(sectionId).update({
            students: firebase.firestore.FieldValue.arrayUnion(studentId)
        });

        // Create enrollment record
        await db.collection('enrollments').doc(`${studentId}_${sectionId}`).set({
            sectionId: sectionId,
            studentId: studentId,
            enrolledAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        return true;
    } catch (error) {
        console.error('Enroll error:', error);
        throw error;
    }
}

// Check in to a section
async function checkInToSection(sectionId, section) {
    if (!section.activeSession) {
        showToast('No active session for this section', 'error');
        return;
    }

    try {
        showLoading('Checking your location...');

        // Get current position
        const position = await getCurrentPosition();
        const {
            latitude,
            longitude
        } = position.coords;

        // Calculate distance from session location
        const sessionLocation = section.activeSession.location;
        const distance = calculateDistance(
            latitude,
            longitude,
            sessionLocation.latitude,
            sessionLocation.longitude
        );

        // Check if within radius
        if (distance > sessionLocation.radius) {
            showToast(`You're too far from the class (${Math.round(distance)}m away)`, 'error');
            return;
        }

        // Record attendance
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        await db.collection('attendance').doc(`${sectionId}_${currentUser.uid}_${today.getTime()}`).set({
            sectionId: sectionId,
            studentId: currentUser.uid,
            date: today,
            status: 'present',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            location: {
                latitude: latitude,
                longitude: longitude,
                distance: distance
            },
            deviceInfo: {
                userAgent: navigator.userAgent,
                platform: navigator.platform
            }
        });

        showToast('Checked in successfully!', 'success');
        initStudentDashboard();
    } catch (error) {
        console.error('Check in error:', error);

        if (error.code === error.PERMISSION_DENIED) {
            showToast('Location permission denied', 'error');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
            showToast('Location unavailable', 'error');
        } else if (error.code === error.TIMEOUT) {
            showToast('Location request timed out', 'error');
        } else {
            showToast('Error checking in', 'error');
        }
    } finally {
        hideLoading();
    }
}

// Show section details for student
function showSectionDetails(sectionId, section) {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';

    // Section info
    const infoGroup = document.createElement('div');
    infoGroup.style.backgroundColor = 'var(--surface-color)';
    infoGroup.style.borderRadius = '12px';
    infoGroup.style.padding = '16px';

    infoGroup.innerHTML = `
        <h3 style="margin: 0 0 8px 0;">${section.name}</h3>
        <p style="margin: 0 0 4px 0; color: var(--text-secondary);">${section.subject}</p>
        <p style="margin: 0 0 12px 0; color: var(--text-secondary);">${section.schedule}</p>
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-chalkboard-teacher" style="color: var(--primary-color);"></i>
            <span style="font-size: 14px;">${section.teacherName}</span>
        </div>
    `;

    content.appendChild(infoGroup);

    // Session status
    const sessionGroup = document.createElement('div');
    sessionGroup.style.backgroundColor = 'var(--surface-color)';
    sessionGroup.style.borderRadius = '12px';
    sessionGroup.style.padding = '16px';

    const isActive = section.activeSession &&
        new Date(section.activeSession.endTime.toDate()) > new Date();

    sessionGroup.innerHTML = `
        <h4 style="margin: 0 0 12px 0;">Session Status</h4>
        ${isActive ? `
            <p style="margin: 0 0 16px 0; color: var(--text-secondary);">
                Session active until ${formatDate(section.activeSession.endTime)}
            </p>
            <button class="btn" style="background-color: var(--primary-color); color: white; width: 100%;">
                Check In Now
            </button>
        ` : `
            <p style="margin: 0 0 16px 0; color: var(--text-secondary);">
                No active session
            </p>
            <button class="btn" style="background-color: #9E9E9E; color: white; width: 100%;" disabled>
                Check In Not Available
            </button>
        `}
    `;

    const sessionButton = sessionGroup.querySelector('button');
    if (isActive) {
        sessionButton.onclick = () => {
            checkInToSection(sectionId, section);
            document.querySelector('.modal-overlay')?.remove();
        };
    }

    content.appendChild(sessionGroup);

    // Leave section
    const leaveGroup = document.createElement('div');
    leaveGroup.style.backgroundColor = 'var(--surface-color)';
    leaveGroup.style.borderRadius = '12px';
    leaveGroup.style.padding = '16px';

    leaveGroup.innerHTML = `
        <h4 style="margin: 0 0 12px 0;">Section Options</h4>
        <button class="btn" style="background-color: #F44336; color: white; width: 100%;">
            Leave Section
        </button>
    `;

    const leaveButton = leaveGroup.querySelector('button');
    leaveButton.onclick = async () => {
        const confirm = await showConfirmation(
            'Leave Section',
            'Are you sure you want to leave this section? Your attendance records will be preserved.',
            'Leave',
            'Cancel'
        );

        if (confirm) {
            try {
                showLoading('Leaving section...');

                // Remove student from section
                await db.collection('sections').doc(sectionId).update({
                    students: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
                });

                // Remove enrollment record
                await db.collection('enrollments').doc(`${currentUser.uid}_${sectionId}`).delete();

                showToast('Section left', 'success');
                document.querySelector('.modal-overlay')?.remove();
                initStudentDashboard();
            } catch (error) {
                console.error('Leave section error:', error);
                showToast('Error leaving section', 'error');
            } finally {
                hideLoading();
            }
        }
    };

    content.appendChild(leaveGroup);

    createModal(section.name, content, [{
        text: 'Close',
        action: () => {},
        style: {
            background: 'none',
            color: 'var(--text-color)'
        }
    }]);
}

// Load student summary data
async function loadStudentSummaryData() {
    try {
        // TODO: Implement actual data loading for summaries
    } catch (error) {
        console.error('Load summary error:', error);
    }
}

// =============================================
// Shared Functions
// =============================================

// Show profile menu
function showProfileMenu() {
    const menuContent = document.createElement('div');
    menuContent.style.padding = '16px';
    menuContent.style.display = 'flex';
    menuContent.style.flexDirection = 'column';
    menuContent.style.gap = '16px';

    // Profile info
    const profileInfo = document.createElement('div');
    profileInfo.style.display = 'flex';
    profileInfo.style.alignItems = 'center';
    profileInfo.style.gap = '12px';
    profileInfo.style.paddingBottom = '12px';
    profileInfo.style.borderBottom = '1px solid var(--border-color)';

    // Load user data
    db.collection('users').doc(currentUser.uid).get().then(userDoc => {
        if (userDoc.exists) {
            const userData = userDoc.data();

            // Avatar
            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            avatar.style.backgroundColor = userData.avatar?.bgColor || getRandomColor();
            avatar.style.width = '48px';
            avatar.style.height = '48px';
            avatar.style.borderRadius = '50%';
            avatar.style.display = 'flex';
            avatar.style.justifyContent = 'center';
            avatar.style.alignItems = 'center';
            avatar.style.fontSize = '20px';
            avatar.textContent = userData.avatar?.emoji + userData.avatar?.text;

            // User info
            const userInfo = document.createElement('div');
            userInfo.innerHTML = `
                <h4 style="margin: 0; font-size: 16px;">${userData.fullName}</h4>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: var(--text-secondary);">${userData.username}</p>
            `;

            profileInfo.appendChild(avatar);
            profileInfo.appendChild(userInfo);
        }
    });

    menuContent.appendChild(profileInfo);

    // Menu items
    const menuItems = [{
            icon: 'fas fa-user-edit',
            text: 'Change Avatar',
            action: showChangeAvatarModal
        },
        {
            icon: 'fas fa-key',
            text: 'Change Password',
            action: showChangePasswordModal
        },
        {
            icon: 'fas fa-cog',
            text: 'Account Settings',
            action: showSettings
        }
    ];

    menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item';
        menuItem.style.display = 'flex';
        menuItem.style.alignItems = 'center';
        menuItem.style.padding = '12px';
        menuItem.style.borderRadius = '8px';
        menuItem.style.cursor = 'pointer';

        menuItem.innerHTML = `
            <i class="${item.icon}" style="margin-right: 12px; width: 24px; text-align: center;"></i>
            <span>${item.text}</span>
        `;

        menuItem.onclick = item.action;

        menuItem.addEventListener('mouseenter', () => {
            menuItem.style.backgroundColor = 'var(--secondary-color)';
        });

        menuItem.addEventListener('mouseleave', () => {
            menuItem.style.backgroundColor = 'transparent';
        });

        menuContent.appendChild(menuItem);
    });

    createModal('Profile', menuContent, [{
        text: 'Close',
        action: () => {},
        style: {
            background: 'none',
            color: 'var(--text-color)'
        }
    }]);
}

// Show change avatar modal
function showChangeAvatarModal() {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';
    content.style.alignItems = 'center';

    // Current avatar preview
    const preview = document.createElement('div');
    preview.className = 'avatar-preview';
    preview.style.width = '100px';
    preview.style.height = '100px';
    preview.style.borderRadius = '50%';
    preview.style.display = 'flex';
    preview.style.justifyContent = 'center';
    preview.style.alignItems = 'center';
    preview.style.fontSize = '40px';
    preview.style.margin = '0 auto 16px auto';

    // Emoji picker
    const emojiGroup = document.createElement('div');
    emojiGroup.style.display = 'flex';
    emojiGroup.style.flexDirection = 'column';
    emojiGroup.style.gap = '4px';
    emojiGroup.style.width = '100%';

    const emojiLabel = document.createElement('label');
    emojiLabel.textContent = 'Emoji';
    emojiLabel.style.fontWeight = '500';

    const emojiInput = document.createElement('input');
    emojiInput.type = 'text';
    emojiInput.placeholder = 'Select an emoji';
    emojiInput.maxLength = 2; // Limit to 1 emoji
    emojiInput.style.padding = '12px';
    emojiInput.style.border = '1px solid var(--border-color)';
    emojiInput.style.borderRadius = '8px';
    emojiInput.style.textAlign = 'center';
    emojiInput.style.fontSize = '24px';

    emojiGroup.appendChild(emojiLabel);
    emojiGroup.appendChild(emojiInput);

    // Text input
    const textGroup = document.createElement('div');
    textGroup.style.display = 'flex';
    textGroup.style.flexDirection = 'column';
    textGroup.style.gap = '4px';
    textGroup.style.width = '100%';

    const textLabel = document.createElement('label');
    textLabel.textContent = 'Text (1-2 letters)';
    textLabel.style.fontWeight = '500';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.placeholder = 'Enter 1-2 letters';
    textInput.maxLength = 2;
    textInput.style.padding = '12px';
    textInput.style.border = '1px solid var(--border-color)';
    textInput.style.borderRadius = '8px';
    textInput.style.textAlign = 'center';
    textInput.style.fontSize = '20px';
    textInput.style.textTransform = 'uppercase';

    textGroup.appendChild(textLabel);
    textGroup.appendChild(textInput);

    // Load current avatar
    db.collection('users').doc(currentUser.uid).get().then(userDoc => {
        if (userDoc.exists) {
            const userData = userDoc.data();
            preview.style.backgroundColor = userData.avatar?.bgColor || getRandomColor();
            preview.textContent = userData.avatar?.emoji + userData.avatar?.text;

            if (userData.avatar?.emoji) {
                emojiInput.value = userData.avatar.emoji;
            }

            if (userData.avatar?.text) {
                textInput.value = userData.avatar.text;
            }

            // Check cooldown
            const lastChanged = userData.avatar?.lastChanged || 0;
            const now = new Date().getTime();

            if (now - lastChanged < AVATAR_CHANGE_COOLDOWN) {
                const daysLeft = Math.ceil((AVATAR_CHANGE_COOLDOWN - (now - lastChanged)) / (1000 * 60 * 60 * 24));
                const cooldownText = document.createElement('p');
                cooldownText.textContent = `You can change your avatar again in ${daysLeft} days.`;
                cooldownText.style.color = '#F44336';
                cooldownText.style.textAlign = 'center';
                cooldownText.style.margin = '8px 0';
                content.appendChild(cooldownText);

                emojiInput.disabled = true;
                textInput.disabled = true;
            }
        }
    });

    // Update preview on input
    emojiInput.oninput = () => {
        preview.textContent = emojiInput.value + textInput.value;
    };

    textInput.oninput = () => {
        preview.textContent = emojiInput.value + textInput.value;
    };

    content.appendChild(preview);
    content.appendChild(emojiGroup);
    content.appendChild(textGroup);

    const modal = createModal('Change Avatar', content, [{
            text: 'Cancel',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Save Changes',
            action: async () => {
                if (!emojiInput.value || !textInput.value) {
                    showToast('Please enter both emoji and text', 'error');
                    return;
                }

                try {
                    const success = await changeAvatar(emojiInput.value, textInput.value);
                    if (success) {
                        modal.close();
                        showProfileMenu();
                    }
                } catch (error) {
                    console.error('Change avatar error:', error);
                    showToast('Error changing avatar', 'error');
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Show change password modal
function showChangePasswordModal() {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';

    // Current password
    const currentGroup = document.createElement('div');
    currentGroup.style.display = 'flex';
    currentGroup.style.flexDirection = 'column';
    currentGroup.style.gap = '4px';

    const currentLabel = document.createElement('label');
    currentLabel.textContent = 'Current Password';
    currentLabel.style.fontWeight = '500';

    const currentInput = document.createElement('input');
    currentInput.type = 'password';
    currentInput.placeholder = 'Enter your current password';
    currentInput.style.padding = '12px';
    currentInput.style.border = '1px solid var(--border-color)';
    currentInput.style.borderRadius = '8px';

    currentGroup.appendChild(currentLabel);
    currentGroup.appendChild(currentInput);
    content.appendChild(currentGroup);

    // New password
    const newGroup = document.createElement('div');
    newGroup.style.display = 'flex';
    newGroup.style.flexDirection = 'column';
    newGroup.style.gap = '4px';

    const newLabel = document.createElement('label');
    newLabel.textContent = 'New Password';
    newLabel.style.fontWeight = '500';

    const newInput = document.createElement('input');
    newInput.type = 'password';
    newInput.placeholder = 'Enter new password (min 6 chars)';
    newInput.style.padding = '12px';
    newInput.style.border = '1px solid var(--border-color)';
    newInput.style.borderRadius = '8px';

    newGroup.appendChild(newLabel);
    newGroup.appendChild(newInput);
    content.appendChild(newGroup);

    // Confirm password
    const confirmGroup = document.createElement('div');
    confirmGroup.style.display = 'flex';
    confirmGroup.style.flexDirection = 'column';
    confirmGroup.style.gap = '4px';

    const confirmLabel = document.createElement('label');
    confirmLabel.textContent = 'Confirm New Password';
    confirmLabel.style.fontWeight = '500';

    const confirmInput = document.createElement('input');
    confirmInput.type = 'password';
    confirmInput.placeholder = 'Confirm new password';
    confirmInput.style.padding = '12px';
    confirmInput.style.border = '1px solid var(--border-color)';
    confirmInput.style.borderRadius = '8px';

    confirmGroup.appendChild(confirmLabel);
    confirmGroup.appendChild(confirmInput);
    content.appendChild(confirmGroup);

    const modal = createModal('Change Password', content, [{
            text: 'Cancel',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Change Password',
            action: async () => {
                if (!currentInput.value || !newInput.value || !confirmInput.value) {
                    showToast('Please fill all fields', 'error');
                    return;
                }

                if (newInput.value.length < 6) {
                    showToast('Password must be at least 6 characters', 'error');
                    return;
                }

                if (newInput.value !== confirmInput.value) {
                    showToast('Passwords do not match', 'error');
                    return;
                }

                try {
                    const success = await changePassword(currentInput.value, newInput.value);
                    if (success) {
                        showToast('Password changed successfully', 'success');
                        modal.close();
                    }
                } catch (error) {
                    console.error('Change password error:', error);
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Show settings
function showSettings() {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';

    // Theme settings
    const themeGroup = document.createElement('div');
    themeGroup.style.display = 'flex';
    themeGroup.style.flexDirection = 'column';
    themeGroup.style.gap = '8px';

    const themeLabel = document.createElement('label');
    themeLabel.textContent = 'Theme';
    themeLabel.style.fontWeight = '500';

    const themeOptions = document.createElement('div');
    themeOptions.style.display = 'flex';
    themeOptions.style.gap = '8px';

    const themes = [{
            value: 'light',
            label: '☀️ Light'
        },
        {
            value: 'dark',
            label: '🌙 Dark'
        },
        {
            value: 'auto',
            label: '🌓 Auto'
        }
    ];

    themes.forEach(theme => {
        const option = document.createElement('button');
        option.className = 'theme-option';
        option.textContent = theme.label;
        option.dataset.value = theme.value;
        option.style.flex = '1';
        option.style.padding = '12px';
        option.style.borderRadius = '8px';
        option.style.border = '1px solid var(--border-color)';
        option.style.backgroundColor = currentTheme === theme.value ? 'var(--primary-color)' : 'var(--surface-color)';
        option.style.color = currentTheme === theme.value ? 'white' : 'var(--text-color)';

        option.onclick = () => {
            currentTheme = theme.value;
            applyTheme(currentTheme);

            // Update button styles
            document.querySelectorAll('.theme-option').forEach(btn => {
                btn.style.backgroundColor = btn.dataset.value === currentTheme ? 'var(--primary-color)' : 'var(--surface-color)';
                btn.style.color = btn.dataset.value === currentTheme ? 'white' : 'var(--text-color)';
            });
        };

        themeOptions.appendChild(option);
    });

    themeGroup.appendChild(themeLabel);
    themeGroup.appendChild(themeOptions);
    content.appendChild(themeGroup);

    // Font size
    const fontSizeGroup = document.createElement('div');
    fontSizeGroup.style.display = 'flex';
    fontSizeGroup.style.flexDirection = 'column';
    fontSizeGroup.style.gap = '8px';

    const fontSizeLabel = document.createElement('label');
    fontSizeLabel.textContent = 'Font Size';
    fontSizeLabel.style.fontWeight = '500';

    const fontSizeOptions = document.createElement('div');
    fontSizeOptions.style.display = 'flex';
    fontSizeOptions.style.gap = '8px';

    const fontSizes = [{
            value: 'small',
            label: 'Small'
        },
        {
            value: 'medium',
            label: 'Medium'
        },
        {
            value: 'large',
            label: 'Large'
        }
    ];

    fontSizes.forEach(size => {
        const option = document.createElement('button');
        option.className = 'font-size-option';
        option.textContent = size.label;
        option.dataset.value = size.value;
        option.style.flex = '1';
        option.style.padding = '12px';
        option.style.borderRadius = '8px';
        option.style.border = '1px solid var(--border-color)';
        option.style.backgroundColor = 'var(--surface-color)';
        option.style.color = 'var(--text-color)';

        // TODO: Load current font size preference
        if (size.value === 'medium') {
            option.style.backgroundColor = 'var(--primary-color)';
            option.style.color = 'white';
        }

        option.onclick = () => {
            // Update button styles
            document.querySelectorAll('.font-size-option').forEach(btn => {
                btn.style.backgroundColor = btn.dataset.value === size.value ? 'var(--primary-color)' : 'var(--surface-color)';
                btn.style.color = btn.dataset.value === size.value ? 'white' : 'var(--text-color)';
            });

            // Apply font size
            const root = document.documentElement;
            let fontSize = '16px';
            if (size.value === 'small') fontSize = '14px';
            else if (size.value === 'large') fontSize = '18px';

            root.style.setProperty('--base-font-size', fontSize);

            // Save preference
            if (currentUser) {
                db.collection('users').doc(currentUser.uid).update({
                    'preferences.fontSize': size.value
                });
            }
        };

        fontSizeOptions.appendChild(option);
    });

    fontSizeGroup.appendChild(fontSizeLabel);
    fontSizeGroup.appendChild(fontSizeOptions);
    content.appendChild(fontSizeGroup);

    // Accent color
    const accentGroup = document.createElement('div');
    accentGroup.style.display = 'flex';
    accentGroup.style.flexDirection = 'column';
    accentGroup.style.gap = '8px';

    const accentLabel = document.createElement('label');
    accentLabel.textContent = 'Accent Color';
    accentLabel.style.fontWeight = '500';

    const accentOptions = document.createElement('div');
    accentOptions.style.display = 'flex';
    accentOptions.style.gap = '8px';

    const accents = [{
            value: 'blue',
            label: 'NearCheck Blue',
            color: '#1976D2'
        },
        {
            value: 'charcoal',
            label: 'Matte Charcoal',
            color: '#424242'
        },
        {
            value: 'cream',
            label: 'Soft Cream',
            color: '#FFE0B2'
        }
    ];

    accents.forEach(accent => {
        const option = document.createElement('button');
        option.className = 'accent-option';
        option.textContent = accent.label;
        option.dataset.value = accent.value;
        option.style.flex = '1';
        option.style.padding = '12px';
        option.style.borderRadius = '8px';
        option.style.border = `2px solid ${accent.color}`;
        option.style.backgroundColor = 'var(--surface-color)';
        option.style.color = 'var(--text-color)';

        // TODO: Load current accent preference
        if (accent.value === 'blue') {
            option.style.border = `2px solid ${accent.color}`;
            option.style.backgroundColor = accent.color;
            option.style.color = 'white';
        }

        option.onclick = () => {
            // Update button styles
            document.querySelectorAll('.accent-option').forEach(btn => {
                if (btn.dataset.value === accent.value) {
                    btn.style.backgroundColor = accent.color;
                    btn.style.color = 'white';
                } else {
                    btn.style.backgroundColor = 'var(--surface-color)';
                    btn.style.color = 'var(--text-color)';
                    btn.style.border = `2px solid ${btn.dataset.value === 'blue' ? '#1976D2' : 
                                      btn.dataset.value === 'charcoal' ? '#424242' : '#FFE0B2'}`;
                }
            });

            // Apply accent color
            const root = document.documentElement;
            root.style.setProperty('--primary-color', accent.color);

            // Save preference
            if (currentUser) {
                db.collection('users').doc(currentUser.uid).update({
                    'preferences.accentColor': accent.value
                });
            }
        };

        accentOptions.appendChild(option);
    });

    accentGroup.appendChild(accentLabel);
    accentGroup.appendChild(accentOptions);
    content.appendChild(accentGroup);

    // Location reminder
    const locationReminderGroup = document.createElement('div');
    locationReminderGroup.style.display = 'flex';
    locationReminderGroup.style.alignItems = 'center';
    locationReminderGroup.style.justifyContent = 'space-between';

    const locationReminderLabel = document.createElement('label');
    locationReminderLabel.textContent = 'Location Permission Reminder';
    locationReminderLabel.style.fontWeight = '500';

    const locationReminderToggle = document.createElement('label');
    locationReminderToggle.className = 'switch';

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = true;

    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'slider round';

    locationReminderToggle.appendChild(toggleInput);
    locationReminderToggle.appendChild(toggleSlider);

    locationReminderGroup.appendChild(locationReminderLabel);
    locationReminderGroup.appendChild(locationReminderToggle);
    content.appendChild(locationReminderGroup);

    // Check-in confirmation
    const checkinConfirmationGroup = document.createElement('div');
    checkinConfirmationGroup.style.display = 'flex';
    checkinConfirmationGroup.style.alignItems = 'center';
    checkinConfirmationGroup.style.justifyContent = 'space-between';

    const checkinConfirmationLabel = document.createElement('label');
    checkinConfirmationLabel.textContent = 'Show Check-In Confirmation';
    checkinConfirmationLabel.style.fontWeight = '500';

    const checkinConfirmationToggle = document.createElement('label');
    checkinConfirmationToggle.className = 'switch';

    const toggleInput2 = document.createElement('input');
    toggleInput2.type = 'checkbox';
    toggleInput2.checked = true;

    const toggleSlider2 = document.createElement('span');
    toggleSlider2.className = 'slider round';

    checkinConfirmationToggle.appendChild(toggleInput2);
    checkinConfirmationToggle.appendChild(toggleSlider2);

    checkinConfirmationGroup.appendChild(checkinConfirmationLabel);
    checkinConfirmationGroup.appendChild(checkinConfirmationToggle);
    content.appendChild(checkinConfirmationGroup);

    // Notifications
    const notificationsGroup = document.createElement('div');
    notificationsGroup.style.display = 'flex';
    notificationsGroup.style.alignItems = 'center';
    notificationsGroup.style.justifyContent = 'space-between';

    const notificationsLabel = document.createElement('label');
    notificationsLabel.textContent = 'Enable Notifications';
    notificationsLabel.style.fontWeight = '500';

    const notificationsToggle = document.createElement('label');
    notificationsToggle.className = 'switch';

    const toggleInput3 = document.createElement('input');
    toggleInput3.type = 'checkbox';

    const toggleSlider3 = document.createElement('span');
    toggleSlider3.className = 'slider round';

    notificationsToggle.appendChild(toggleInput3);
    notificationsToggle.appendChild(toggleSlider3);

    notificationsGroup.appendChild(notificationsLabel);
    notificationsGroup.appendChild(notificationsToggle);
    content.appendChild(notificationsGroup);

    // Session timeout
    const timeoutGroup = document.createElement('div');
    timeoutGroup.style.display = 'flex';
    timeoutGroup.style.flexDirection = 'column';
    timeoutGroup.style.gap = '8px';

    const timeoutLabel = document.createElement('label');
    timeoutLabel.textContent = 'Session Timeout';
    timeoutLabel.style.fontWeight = '500';

    const timeoutSelect = document.createElement('select');
    timeoutSelect.style.padding = '12px';
    timeoutSelect.style.border = '1px solid var(--border-color)';
    timeoutSelect.style.borderRadius = '8px';
    timeoutSelect.style.backgroundColor = 'var(--background-color)';
    timeoutSelect.style.color = 'var(--text-color)';

    const timeouts = [{
            value: 15,
            text: '15 minutes'
        },
        {
            value: 30,
            text: '30 minutes'
        },
        {
            value: 60,
            text: '1 hour'
        }
    ];

    timeouts.forEach(timeout => {
        const option = document.createElement('option');
        option.value = timeout.value;
        option.textContent = timeout.text;
        timeoutSelect.appendChild(option);
    });

    timeoutGroup.appendChild(timeoutLabel);
    timeoutGroup.appendChild(timeoutSelect);
    content.appendChild(timeoutGroup);

    // Language
    const languageGroup = document.createElement('div');
    languageGroup.style.display = 'flex';
    languageGroup.style.flexDirection = 'column';
    languageGroup.style.gap = '8px';

    const languageLabel = document.createElement('label');
    languageLabel.textContent = 'Language';
    languageLabel.style.fontWeight = '500';

    const languageSelect = document.createElement('select');
    languageSelect.style.padding = '12px';
    languageSelect.style.border = '1px solid var(--border-color)';
    languageSelect.style.borderRadius = '8px';
    languageSelect.style.backgroundColor = 'var(--background-color)';
    languageSelect.style.color = 'var(--text-color)';

    const languages = [{
            value: 'en',
            text: 'English'
        },
        {
            value: 'tl',
            text: 'Tagalog'
        }
    ];

    languages.forEach(language => {
        const option = document.createElement('option');
        option.value = language.value;
        option.textContent = language.text;
        languageSelect.appendChild(option);
    });

    languageGroup.appendChild(languageLabel);
    languageGroup.appendChild(languageSelect);
    content.appendChild(languageGroup);

    // Voice announcements
    const voiceGroup = document.createElement('div');
    voiceGroup.style.display = 'flex';
    voiceGroup.style.alignItems = 'center';
    voiceGroup.style.justifyContent = 'space-between';

    const voiceLabel = document.createElement('label');
    voiceLabel.textContent = 'Voice Announcements';
    voiceLabel.style.fontWeight = '500';

    const voiceToggle = document.createElement('label');
    voiceToggle.className = 'switch';

    const toggleInput4 = document.createElement('input');
    toggleInput4.type = 'checkbox';

    const toggleSlider4 = document.createElement('span');
    toggleSlider4.className = 'slider round';

    voiceToggle.appendChild(toggleInput4);
    voiceToggle.appendChild(toggleSlider4);

    voiceGroup.appendChild(voiceLabel);
    voiceGroup.appendChild(voiceToggle);
    content.appendChild(voiceGroup);

    createModal('Settings', content, [{
            text: 'Close',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Save Settings',
            action: async () => {
                try {
                    showLoading('Saving settings...');

                    const updates = {
                        'preferences.theme': currentTheme,
                        'preferences.fontSize': document.querySelector('.font-size-option[style*="var(--primary-color)"]')?.dataset.value || 'medium',
                        'preferences.accentColor': document.querySelector('.accent-option[style*="white"]')?.dataset.value || 'blue',
                        'preferences.locationReminder': toggleInput.checked,
                        'preferences.checkinConfirmation': toggleInput2.checked,
                        'preferences.notifications': toggleInput3.checked,
                        'preferences.sessionTimeout': parseInt(timeoutSelect.value),
                        'preferences.language': languageSelect.value,
                        'preferences.voiceAnnouncements': toggleInput4.checked
                    };

                    await db.collection('users').doc(currentUser.uid).update(updates);

                    showToast('Settings saved', 'success');
                } catch (error) {
                    console.error('Save settings error:', error);
                    showToast('Error saving settings', 'error');
                } finally {
                    hideLoading();
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Show attendance reports
function showAttendanceReports() {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';

    // Date range picker
    const dateRangeGroup = document.createElement('div');
    dateRangeGroup.style.display = 'flex';
    dateRangeGroup.style.gap = '8px';

    const startDateInput = document.createElement('input');
    startDateInput.type = 'date';
    startDateInput.style.flex = '1';
    startDateInput.style.padding = '10px';
    startDateInput.style.border = '1px solid var(--border-color)';
    startDateInput.style.borderRadius = '8px';

    const endDateInput = document.createElement('input');
    endDateInput.type = 'date';
    endDateInput.style.flex = '1';
    endDateInput.style.padding = '10px';
    endDateInput.style.border = '1px solid var(--border-color)';
    endDateInput.style.borderRadius = '8px';

    dateRangeGroup.appendChild(startDateInput);
    dateRangeGroup.appendChild(endDateInput);
    content.appendChild(dateRangeGroup);

    // Section filter
    const sectionGroup = document.createElement('div');
    sectionGroup.style.display = 'flex';
    sectionGroup.style.flexDirection = 'column';
    sectionGroup.style.gap = '4px';

    const sectionLabel = document.createElement('label');
    sectionLabel.textContent = 'Filter by Section';
    sectionLabel.style.fontWeight = '500';

    const sectionSelect = document.createElement('select');
    sectionSelect.style.padding = '12px';
    sectionSelect.style.border = '1px solid var(--border-color)';
    sectionSelect.style.borderRadius = '8px';
    sectionSelect.style.backgroundColor = 'var(--background-color)';
    sectionSelect.style.color = 'var(--text-color)';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Sections';
    sectionSelect.appendChild(allOption);

    // Load sections
    if (currentRole === 'teacher') {
        db.collection('sections')
            .where('teacherId', '==', currentUser.uid)
            .get()
            .then(snapshot => {
                snapshot.forEach(doc => {
                    const option = document.createElement('option');
                    option.value = doc.id;
                    option.textContent = doc.data().name;
                    sectionSelect.appendChild(option);
                });
            });
    } else {
        db.collection('enrollments')
            .where('studentId', '==', currentUser.uid)
            .get()
            .then(snapshot => {
                const sectionPromises = snapshot.docs.map(doc =>
                    db.collection('sections').doc(doc.data().sectionId).get()
                );

                Promise.all(sectionPromises).then(sectionDocs => {
                    sectionDocs.forEach(doc => {
                        if (doc.exists) {
                            const option = document.createElement('option');
                            option.value = doc.id;
                            option.textContent = doc.data().name;
                            sectionSelect.appendChild(option);
                        }
                    });
                });
            });
    }

    sectionGroup.appendChild(sectionLabel);
    sectionGroup.appendChild(sectionSelect);
    content.appendChild(sectionGroup);

    // Generate report button
    const generateButton = document.createElement('button');
    generateButton.className = 'btn';
    generateButton.textContent = 'Generate Report';
    generateButton.style.backgroundColor = 'var(--primary-color)';
    generateButton.style.color = 'white';
    generateButton.style.width = '100%';
    generateButton.style.marginTop = '16px';

    generateButton.onclick = async () => {
        try {
            showLoading('Generating report...');

            const startDate = new Date(startDateInput.value);
            const endDate = new Date(endDateInput.value);
            const sectionId = sectionSelect.value;

            if (!startDateInput.value || !endDateInput.value) {
                showToast('Please select date range', 'error');
                return;
            }

            if (startDate > endDate) {
                showToast('Start date must be before end date', 'error');
                return;
            }

            // Adjust end date to end of day
            endDate.setHours(23, 59, 59, 999);

            let query = db.collection('attendance')
                .where('date', '>=', startDate)
                .where('date', '<=', endDate);

            if (currentRole === 'teacher') {
                if (sectionId !== 'all') {
                    query = query.where('sectionId', '==', sectionId);
                } else {
                    // Get all sections taught by this teacher
                    const sectionsSnapshot = await db.collection('sections')
                        .where('teacherId', '==', currentUser.uid)
                        .get();

                    const sectionIds = sectionsSnapshot.docs.map(doc => doc.id);
                    query = query.where('sectionId', 'in', sectionIds);
                }
            } else {
                query = query.where('studentId', '==', currentUser.uid);
                if (sectionId !== 'all') {
                    query = query.where('sectionId', '==', sectionId);
                }
            }

            const snapshot = await query.get();

            if (snapshot.empty) {
                showToast('No attendance records found', 'info');
                return;
            }

            // Process data and show results
            showAttendanceReportResults(snapshot.docs.map(doc => doc.data()));
        } catch (error) {
            console.error('Generate report error:', error);
            showToast('Error generating report', 'error');
        } finally {
            hideLoading();
        }
    };

    content.appendChild(generateButton);

    createModal('Attendance Reports', content, [{
        text: 'Close',
        action: () => {},
        style: {
            background: 'none',
            color: 'var(--text-color)'
        }
    }]);
}

// Show attendance report results
function showAttendanceReportResults(records) {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';

    // Summary statistics
    const summaryGroup = document.createElement('div');
    summaryGroup.style.display = 'grid';
    summaryGroup.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
    summaryGroup.style.gap = '12px';
    summaryGroup.style.marginBottom = '16px';

    const statusCounts = {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0
    };

    records.forEach(record => {
        statusCounts[record.status]++;
    });

    const totalRecords = records.length;

    const summaryItems = [{
            status: 'present',
            color: '#4CAF50',
            icon: 'fas fa-check'
        },
        {
            status: 'absent',
            color: '#F44336',
            icon: 'fas fa-times'
        },
        {
            status: 'late',
            color: '#FF9800',
            icon: 'fas fa-clock'
        },
        {
            status: 'excused',
            color: '#9C27B0',
            icon: 'fas fa-user-clock'
        }
    ];

    summaryItems.forEach(item => {
        const count = statusCounts[item.status];
        const percentage = totalRecords > 0 ? Math.round((count / totalRecords) * 100) : 0;

        const summaryItem = document.createElement('div');
        summaryItem.style.backgroundColor = 'var(--surface-color)';
        summaryItem.style.borderRadius = '8px';
        summaryItem.style.padding = '12px';
        summaryItem.style.textAlign = 'center';

        summaryItem.innerHTML = `
            <div style="font-size: 24px; font-weight: 600; color: ${item.color};">${count}</div>
            <div style="font-size: 14px; color: var(--text-secondary); text-transform: capitalize;">${item.status}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">${percentage}%</div>
        `;

        summaryGroup.appendChild(summaryItem);
    });

    content.appendChild(summaryGroup);

    // Attendance list
    const listHeader = document.createElement('h4');
    listHeader.textContent = 'Attendance Records';
    listHeader.style.margin = '0 0 8px 0';

    content.appendChild(listHeader);

    const attendanceList = document.createElement('div');
    attendanceList.className = 'attendance-list';
    attendanceList.style.maxHeight = '300px';
    attendanceList.style.overflowY = 'auto';

    if (records.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.style.textAlign = 'center';
        emptyState.style.padding = '32px 16px';
        emptyState.style.color = 'var(--text-secondary)';

        emptyState.innerHTML = `
            <i class="fas fa-calendar-times" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
            <p style="margin: 0;">No attendance records found.</p>
        `;

        attendanceList.appendChild(emptyState);
    } else {
        // Group by date
        const recordsByDate = {};
        records.forEach(record => {
            const dateStr = record.date.toDate ? record.date.toDate().toLocaleDateString() : new Date(record.date).toLocaleDateString();

            if (!recordsByDate[dateStr]) {
                recordsByDate[dateStr] = [];
            }

            recordsByDate[dateStr].push(record);
        });

        // Sort dates descending
        const sortedDates = Object.keys(recordsByDate).sort((a, b) => {
            return new Date(b) - new Date(a);
        });

        sortedDates.forEach(dateStr => {
            const dateGroup = document.createElement('div');
            dateGroup.style.marginBottom = '16px';

            const dateHeader = document.createElement('div');
            dateHeader.style.display = 'flex';
            dateHeader.style.justifyContent = 'space-between';
            dateHeader.style.alignItems = 'center';
            dateHeader.style.marginBottom = '8px';
            dateHeader.style.paddingBottom = '8px';
            dateHeader.style.borderBottom = '1px solid var(--border-color)';

            dateHeader.innerHTML = `
                <span style="font-weight: 500;">${dateStr}</span>
                <span style="font-size: 12px; color: var(--text-secondary);">${recordsByDate[dateStr].length} records</span>
            `;

            dateGroup.appendChild(dateHeader);

            recordsByDate[dateStr].forEach(record => {
                const listItem = document.createElement('div');
                listItem.style.display = 'flex';
                listItem.style.justifyContent = 'space-between';
                listItem.style.alignItems = 'center';
                listItem.style.padding = '12px';
                listItem.style.marginBottom = '8px';
                listItem.style.backgroundColor = 'var(--surface-color)';
                listItem.style.borderRadius = '8px';

                let statusColor = '#2196F3';
                if (record.status === 'present') statusColor = '#4CAF50';
                else if (record.status === 'absent') statusColor = '#F44336';
                else if (record.status === 'late') statusColor = '#FF9800';
                else if (record.status === 'excused') statusColor = '#9C27B0';

                // Load section name if available
                let sectionName = 'Section';
                if (record.sectionId) {
                    db.collection('sections').doc(record.sectionId).get()
                        .then(sectionDoc => {
                            if (sectionDoc.exists) {
                                const nameSpan = listItem.querySelector('.section-name');
                                if (nameSpan) {
                                    nameSpan.textContent = sectionDoc.data().name;
                                }
                            }
                        });
                }

                // Load student/teacher name if available
                let personName = '';
                if (currentRole === 'teacher' && record.studentId) {
                    db.collection('users').doc(record.studentId).get()
                        .then(userDoc => {
                            if (userDoc.exists) {
                                const nameSpan = listItem.querySelector('.person-name');
                                if (nameSpan) {
                                    nameSpan.textContent = userDoc.data().fullName;
                                }
                            }
                        });
                } else if (currentRole === 'student' && record.markedBy) {
                    db.collection('users').doc(record.markedBy).get()
                        .then(userDoc => {
                            if (userDoc.exists) {
                                const nameSpan = listItem.querySelector('.person-name');
                                if (nameSpan) {
                                    nameSpan.textContent = userDoc.data().fullName;
                                }
                            }
                        });
                }

                listItem.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusColor};"></div>
                        <span style="text-transform: capitalize;">${record.status}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end;">
                        <span class="section-name" style="font-size: 12px; color: var(--text-secondary);">${sectionName}</span>
                        <span class="person-name" style="font-size: 12px; color: var(--text-secondary);">${personName || ''}</span>
                    </div>
                `;

                dateGroup.appendChild(listItem);
            });

            attendanceList.appendChild(dateGroup);
        });
    }

    content.appendChild(attendanceList);

    // Export button
    const exportButton = document.createElement('button');
    exportButton.className = 'btn';
    exportButton.textContent = 'Export as CSV';
    exportButton.style.backgroundColor = 'var(--primary-color)';
    exportButton.style.color = 'white';
    exportButton.style.width = '100%';
    exportButton.style.marginTop = '16px';

    exportButton.onclick = () => {
        // Convert records to CSV
        let csv = 'Date,Status,Section,Recorded By\n';

        records.forEach(record => {
            const date = record.date.toDate ? record.date.toDate().toLocaleDateString() : new Date(record.date).toLocaleDateString();
            const section = record.sectionId || '';
            const recordedBy = record.markedBy || '';

            csv += `"${date}","${record.status}","${section}","${recordedBy}"\n`;
        });

        // Download CSV
        const blob = new Blob([csv], {
            type: 'text/csv'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'NearCheck_Attendance_Report.csv';
        link.click();
    };

    content.appendChild(exportButton);

    createModal('Report Results', content, [{
        text: 'Close',
        action: () => {},
        style: {
            background: 'none',
            color: 'var(--text-color)'
        }
    }]);
}

// Show all attendance
function showAllAttendance() {
    // For now, just show the reports modal
    showAttendanceReports();
}

// Show notifications
function showNotifications() {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';

    // Notification settings
    const settingsGroup = document.createElement('div');
    settingsGroup.style.display = 'flex';
    settingsGroup.style.flexDirection = 'column';
    settingsGroup.style.gap = '8px';
    settingsGroup.style.marginBottom = '16px';

    const settingsLabel = document.createElement('h4');
    settingsLabel.textContent = 'Notification Settings';
    settingsLabel.style.margin = '0 0 8px 0';

    // Check-in reminders
    const remindersGroup = document.createElement('div');
    remindersGroup.style.display = 'flex';
    remindersGroup.style.alignItems = 'center';
    remindersGroup.style.justifyContent = 'space-between';

    const remindersLabel = document.createElement('label');
    remindersLabel.textContent = 'Check-In Reminders';
    remindersLabel.style.fontWeight = '500';

    const remindersToggle = document.createElement('label');
    remindersToggle.className = 'switch';

    const toggleInput1 = document.createElement('input');
    toggleInput1.type = 'checkbox';

    const toggleSlider1 = document.createElement('span');
    toggleSlider1.className = 'slider round';

    remindersToggle.appendChild(toggleInput1);
    remindersToggle.appendChild(toggleSlider1);

    remindersGroup.appendChild(remindersLabel);
    remindersGroup.appendChild(remindersToggle);

    // Attendance updates
    const updatesGroup = document.createElement('div');
    updatesGroup.style.display = 'flex';
    updatesGroup.style.alignItems = 'center';
    updatesGroup.style.justifyContent = 'space-between';

    const updatesLabel = document.createElement('label');
    updatesLabel.textContent = 'Attendance Updates';
    updatesLabel.style.fontWeight = '500';

    const updatesToggle = document.createElement('label');
    updatesToggle.className = 'switch';

    const toggleInput2 = document.createElement('input');
    toggleInput2.type = 'checkbox';

    const toggleSlider2 = document.createElement('span');
    toggleSlider2.className = 'slider round';

    updatesToggle.appendChild(toggleInput2);
    updatesToggle.appendChild(toggleSlider2);

    updatesGroup.appendChild(updatesLabel);
    updatesGroup.appendChild(updatesToggle);

    // Teacher alerts
    const alertsGroup = document.createElement('div');
    alertsGroup.style.display = 'flex';
    alertsGroup.style.alignItems = 'center';
    alertsGroup.style.justifyContent = 'space-between';

    const alertsLabel = document.createElement('label');
    alertsLabel.textContent = 'Teacher Alerts';
    alertsLabel.style.fontWeight = '500';

    const alertsToggle = document.createElement('label');
    alertsToggle.className = 'switch';

    const toggleInput3 = document.createElement('input');
    toggleInput3.type = 'checkbox';

    const toggleSlider3 = document.createElement('span');
    toggleSlider3.className = 'slider round';

    alertsToggle.appendChild(toggleInput3);
    alertsToggle.appendChild(toggleSlider3);

    alertsGroup.appendChild(alertsLabel);
    alertsGroup.appendChild(alertsToggle);

    settingsGroup.appendChild(settingsLabel);
    settingsGroup.appendChild(remindersGroup);
    settingsGroup.appendChild(updatesGroup);
    settingsGroup.appendChild(alertsGroup);
    content.appendChild(settingsGroup);

    // Notification list
    const listHeader = document.createElement('h4');
    listHeader.textContent = 'Recent Notifications';
    listHeader.style.margin = '0 0 8px 0';

    content.appendChild(listHeader);

    const notificationList = document.createElement('div');
    notificationList.className = 'notification-list';

    // Placeholder notifications
    const notifications = [{
            title: 'Check-In Reminder',
            message: 'You have a session starting in 5 minutes',
            time: '10 min ago',
            read: false
        },
        {
            title: 'Attendance Recorded',
            message: 'Your attendance has been marked as present',
            time: '2 hours ago',
            read: true
        },
        {
            title: 'New Message',
            message: 'You have a new message from your teacher',
            time: '1 day ago',
            read: true
        }
    ];

    notifications.forEach(notification => {
        const item = document.createElement('div');
        item.className = 'notification-item';
        item.style.display = 'flex';
        item.style.flexDirection = 'column';
        item.style.padding = '12px';
        item.style.marginBottom = '8px';
        item.style.backgroundColor = notification.read ? 'var(--surface-color)' : 'var(--primary-color-light)';
        item.style.borderRadius = '8px';

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <h5 style="margin: 0; font-size: 14px; color: var(--primary-color);">${notification.title}</h5>
                <span style="font-size: 12px; color: var(--text-secondary);">${notification.time}</span>
            </div>
            <p style="margin: 0; font-size: 14px;">${notification.message}</p>
        `;

        notificationList.appendChild(item);
    });

    content.appendChild(notificationList);

    createModal('Notifications', content, [{
            text: 'Close',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Save Settings',
            action: async () => {
                try {
                    showLoading('Saving notification settings...');

                    const updates = {
                        'preferences.notifications.checkinReminders': toggleInput1.checked,
                        'preferences.notifications.attendanceUpdates': toggleInput2.checked,
                        'preferences.notifications.teacherAlerts': toggleInput3.checked
                    };

                    await db.collection('users').doc(currentUser.uid).update(updates);

                    showToast('Notification settings saved', 'success');
                } catch (error) {
                    console.error('Save notification settings error:', error);
                    showToast('Error saving settings', 'error');
                } finally {
                    hideLoading();
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Show help and support
function showHelp() {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';

    // FAQ section
    const faqGroup = document.createElement('div');
    faqGroup.style.marginBottom = '16px';

    const faqTitle = document.createElement('h4');
    faqTitle.textContent = 'Frequently Asked Questions';
    faqTitle.style.margin = '0 0 12px 0';

    const faqItems = [{
            question: 'How do I check in to a class?',
            answer: 'When your teacher starts a session, you will see a "Check In" button on your dashboard. Tap it to verify your location and check in.'
        },
        {
            question: 'What if I\'m too far from the class?',
            answer: 'If you\'re outside the allowed radius, you won\'t be able to check in. Contact your teacher if you believe this is an error.'
        },
        {
            question: 'Can I change my avatar?',
            answer: 'Yes, you can change your avatar emoji and text every 5 days from your profile settings.'
        },
        {
            question: 'How do I join a section?',
            answer: 'You need an invitation link or section ID from your teacher. Use the "Join Section" option in the app to enter this information.'
        }
    ];

    const faqList = document.createElement('div');
    faqList.style.display = 'flex';
    faqList.style.flexDirection = 'column';
    faqList.style.gap = '12px';

    faqItems.forEach(item => {
        const faqItem = document.createElement('div');
        faqItem.style.backgroundColor = 'var(--surface-color)';
        faqItem.style.borderRadius = '8px';
        faqItem.style.padding = '12px';

        const question = document.createElement('div');
        question.style.display = 'flex';
        question.style.justifyContent = 'space-between';
        question.style.alignItems = 'center';
        question.style.marginBottom = '8px';
        question.style.cursor = 'pointer';

        question.innerHTML = `
            <h5 style="margin: 0; font-size: 14px;">${item.question}</h5>
            <i class="fas fa-chevron-down" style="transition: transform 0.3s ease;"></i>
        `;

        const answer = document.createElement('div');
        answer.style.display = 'none';
        answer.style.fontSize = '14px';
        answer.style.color = 'var(--text-secondary)';
        answer.innerHTML = `<p style="margin: 0;">${item.answer}</p>`;

        question.onclick = () => {
            const isOpen = answer.style.display === 'block';
            answer.style.display = isOpen ? 'none' : 'block';
            question.querySelector('i').style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        };

        faqItem.appendChild(question);
        faqItem.appendChild(answer);
        faqList.appendChild(faqItem);
    });

    faqGroup.appendChild(faqTitle);
    faqGroup.appendChild(faqList);
    content.appendChild(faqGroup);

    // Contact support
    const contactGroup = document.createElement('div');
    contactGroup.style.marginBottom = '16px';

    const contactTitle = document.createElement('h4');
    contactTitle.textContent = 'Contact Support';
    contactTitle.style.margin = '0 0 12px 0';

    const contactForm = document.createElement('form');
    contactForm.style.display = 'flex';
    contactForm.style.flexDirection = 'column';
    contactForm.style.gap = '12px';

    const subjectInput = document.createElement('input');
    subjectInput.type = 'text';
    subjectInput.placeholder = 'Subject';
    subjectInput.style.padding = '12px';
    subjectInput.style.border = '1px solid var(--border-color)';
    subjectInput.style.borderRadius = '8px';

    const messageInput = document.createElement('textarea');
    messageInput.placeholder = 'Your message';
    messageInput.rows = 4;
    messageInput.style.padding = '12px';
    messageInput.style.border = '1px solid var(--border-color)';
    messageInput.style.borderRadius = '8px';
    messageInput.style.resize = 'none';

    contactForm.appendChild(subjectInput);
    contactForm.appendChild(messageInput);
    contactGroup.appendChild(contactTitle);
    contactGroup.appendChild(contactForm);
    content.appendChild(contactGroup);

    createModal('Help & Support', content, [{
            text: 'Close',
            action: () => {},
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Send Message',
            action: async () => {
                if (!subjectInput.value || !messageInput.value) {
                    showToast('Please fill all fields', 'error');
                    return;
                }

                try {
                    showLoading('Sending message...');

                    // In a real app, you would send this to your backend
                    await db.collection('supportMessages').add({
                        userId: currentUser.uid,
                        subject: subjectInput.value,
                        message: messageInput.value,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        status: 'new'
                    });

                    showToast('Message sent successfully', 'success');
                    document.querySelector('.modal-overlay')?.remove();
                } catch (error) {
                    console.error('Send message error:', error);
                    showToast('Error sending message', 'error');
                } finally {
                    hideLoading();
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// =============================================
// Geolocation Functions
// =============================================

// Get current position with permission handling
function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            position => resolve(position),
            error => reject(error), {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

// =============================================
// Welcome Screen and Authentication UI
// =============================================

// Show welcome screen
function showWelcomeScreen() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    // Check if there's a join parameter in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const joinSectionId = urlParams.get('join');

    if (joinSectionId) {
        showStudentSignUp(joinSectionId);
        return;
    }

    // Create welcome screen
    const welcomeScreen = document.createElement('div');
    welcomeScreen.className = 'welcome-screen';
    welcomeScreen.style.display = 'flex';
    welcomeScreen.style.flexDirection = 'column';
    welcomeScreen.style.justifyContent = 'center';
    welcomeScreen.style.alignItems = 'center';
    welcomeScreen.style.height = '100vh';
    welcomeScreen.style.padding = '24px';
    welcomeScreen.style.textAlign = 'center';

    // App logo
    const logo = document.createElement('div');
    logo.className = 'app-logo';
    logo.style.marginBottom = '32px';

    logo.innerHTML = `
        <svg viewBox="0 0 100 100" width="80" height="80" style="margin-bottom: 16px;">
            <circle cx="50" cy="50" r="45" fill="#1976D2"/>
            <path d="M30,30 L70,30 L70,70 L30,70 Z" fill="white"/>
            <circle cx="50" cy="50" r="15" fill="#1976D2"/>
        </svg>
        <h1 style="margin: 0; font-size: 28px; color: var(--text-color);">NearCheck Lite</h1>
    `;

    // Tagline
    const tagline = document.createElement('p');
    tagline.textContent = 'Trusted by teachers, loved by students';
    tagline.style.margin = '8px 0 32px 0';
    tagline.style.color = 'var(--text-secondary)';
    tagline.style.fontSize = '16px';

    // Role selection
    const roleSelection = document.createElement('div');
    roleSelection.style.display = 'flex';
    roleSelection.style.flexDirection = 'column';
    roleSelection.style.gap = '12px';
    roleSelection.style.width = '100%';
    roleSelection.style.maxWidth = '300px';
    roleSelection.style.marginBottom = '24px';

    const teacherButton = document.createElement('button');
    teacherButton.className = 'btn';
    teacherButton.textContent = 'Teacher';
    teacherButton.style.backgroundColor = 'var(--primary-color)';
    teacherButton.style.color = 'white';
    teacherButton.style.padding = '14px';
    teacherButton.style.borderRadius = '8px';
    teacherButton.style.fontSize = '16px';
    teacherButton.style.fontWeight = '500';
    teacherButton.onclick = () => showTeacherSignUp();

    const studentButton = document.createElement('button');
    studentButton.className = 'btn';
    studentButton.textContent = 'Student';
    studentButton.style.backgroundColor = 'var(--surface-color)';
    studentButton.style.color = 'var(--text-color)';
    studentButton.style.padding = '14px';
    studentButton.style.borderRadius = '8px';
    studentButton.style.fontSize = '16px';
    studentButton.style.fontWeight = '500';
    studentButton.style.border = '1px solid var(--border-color)';
    studentButton.onclick = () => showStudentSignUp();

    roleSelection.appendChild(teacherButton);
    roleSelection.appendChild(studentButton);

    // Footer
    const footer = document.createElement('div');
    footer.style.marginTop = '24px';

    const signInText = document.createElement('p');
    signInText.style.margin = '0 0 8px 0';
    signInText.style.color = 'var(--text-secondary)';
    signInText.textContent = 'Already have an account?';

    const signInButton = document.createElement('button');
    signInButton.className = 'text-button';
    signInButton.textContent = 'Sign In';
    signInButton.style.color = 'var(--primary-color)';
    signInButton.style.fontWeight = '500';
    signInButton.onclick = showSignIn;

    const termsText = document.createElement('p');
    termsText.style.margin = '24px 0 0 0';
    termsText.style.fontSize = '12px';
    termsText.style.color = 'var(--text-secondary)';
    termsText.innerHTML = 'By continuing to NearCheck Lite, you agree to our <a href="#" style="color: var(--primary-color);">Terms</a> and <a href="#" style="color: var(--primary-color);">Privacy Policy</a>';

    footer.appendChild(signInText);
    footer.appendChild(signInButton);
    footer.appendChild(termsText);

    welcomeScreen.appendChild(logo);
    welcomeScreen.appendChild(tagline);
    welcomeScreen.appendChild(roleSelection);
    welcomeScreen.appendChild(footer);

    app.appendChild(welcomeScreen);
}

// Show teacher sign up form
function showTeacherSignUp() {
    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '16px';
    form.style.width = '100%';
    form.style.maxWidth = '400px';

    // Full name
    const nameGroup = document.createElement('div');
    nameGroup.style.display = 'flex';
    nameGroup.style.flexDirection = 'column';
    nameGroup.style.gap = '4px';

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Full Name';
    nameLabel.style.fontWeight = '500';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Enter your full name';
    nameInput.required = true;
    nameInput.style.padding = '12px';
    nameInput.style.border = '1px solid var(--border-color)';
    nameInput.style.borderRadius = '8px';

    const usernamePreview = document.createElement('div');
    usernamePreview.textContent = 'Username: username@nearcheck';
    usernamePreview.style.fontSize = '12px';
    usernamePreview.style.color = 'var(--text-secondary)';
    usernamePreview.style.marginTop = '4px';

    nameInput.oninput = () => {
        const username = generateUsername(nameInput.value);
        usernamePreview.textContent = `Username: ${username}`;
    };

    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    nameGroup.appendChild(usernamePreview);

    // Email
    const emailGroup = document.createElement('div');
    emailGroup.style.display = 'flex';
    emailGroup.style.flexDirection = 'column';
    emailGroup.style.gap = '4px';

    const emailLabel = document.createElement('label');
    emailLabel.textContent = 'Email Address';
    emailLabel.style.fontWeight = '500';

    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.placeholder = 'Enter your email';
    emailInput.required = true;
    emailInput.style.padding = '12px';
    emailInput.style.border = '1px solid var(--border-color)';
    emailInput.style.borderRadius = '8px';

    emailGroup.appendChild(emailLabel);
    emailGroup.appendChild(emailInput);

    // Password
    const passwordGroup = document.createElement('div');
    passwordGroup.style.display = 'flex';
    passwordGroup.style.flexDirection = 'column';
    passwordGroup.style.gap = '4px';

    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = 'Password';
    passwordLabel.style.fontWeight = '500';

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Create a password (min 6 chars)';
    passwordInput.minLength = 6;
    passwordInput.required = true;
    passwordInput.style.padding = '12px';
    passwordInput.style.border = '1px solid var(--border-color)';
    passwordInput.style.borderRadius = '8px';

    passwordGroup.appendChild(passwordLabel);
    passwordGroup.appendChild(passwordInput);

    // Confirm password
    const confirmGroup = document.createElement('div');
    confirmGroup.style.display = 'flex';
    confirmGroup.style.flexDirection = 'column';
    confirmGroup.style.gap = '4px';

    const confirmLabel = document.createElement('label');
    confirmLabel.textContent = 'Confirm Password';
    confirmLabel.style.fontWeight = '500';

    const confirmInput = document.createElement('input');
    confirmInput.type = 'password';
    confirmInput.placeholder = 'Confirm your password';
    confirmInput.required = true;
    confirmInput.style.padding = '12px';
    confirmInput.style.border = '1px solid var(--border-color)';
    confirmInput.style.borderRadius = '8px';

    confirmGroup.appendChild(confirmLabel);
    confirmGroup.appendChild(confirmInput);

    // Terms checkbox
    const termsGroup = document.createElement('div');
    termsGroup.style.display = 'flex';
    termsGroup.style.alignItems = 'center';
    termsGroup.style.gap = '8px';
    termsGroup.style.marginTop = '8px';

    const termsCheckbox = document.createElement('input');
    termsCheckbox.type = 'checkbox';
    termsCheckbox.id = 'terms';
    termsCheckbox.required = true;

    const termsLabel = document.createElement('label');
    termsLabel.htmlFor = 'terms';
    termsLabel.textContent = 'I agree with NearCheck Lite Terms and Privacy Policy';
    termsLabel.style.fontSize = '14px';

    termsGroup.appendChild(termsCheckbox);
    termsGroup.appendChild(termsLabel);

    form.appendChild(nameGroup);
    form.appendChild(emailGroup);
    form.appendChild(passwordGroup);
    form.appendChild(confirmGroup);
    form.appendChild(termsGroup);

    const modal = createModal('Teacher Sign Up', form, [{
            text: 'Cancel',
            action: () => showWelcomeScreen(),
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Continue',
            action: async () => {
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }

                if (passwordInput.value !== confirmInput.value) {
                    showToast('Passwords do not match', 'error');
                    return;
                }

                if (passwordInput.value.length < 6) {
                    showToast('Password must be at least 6 characters', 'error');
                    return;
                }

                try {
                    await signUp(
                        nameInput.value.trim(),
                        emailInput.value.trim(),
                        passwordInput.value,
                        'teacher'
                    );
                } catch (error) {
                    console.error('Sign up error:', error);
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Show student sign up form
function showStudentSignUp(sectionId = null) {
    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '16px';
    form.style.width = '100%';
    form.style.maxWidth = '400px';

    // Full name
    const nameGroup = document.createElement('div');
    nameGroup.style.display = 'flex';
    nameGroup.style.flexDirection = 'column';
    nameGroup.style.gap = '4px';

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Full Name';
    nameLabel.style.fontWeight = '500';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Enter your full name';
    nameInput.required = true;
    nameInput.style.padding = '12px';
    nameInput.style.border = '1px solid var(--border-color)';
    nameInput.style.borderRadius = '8px';

    const usernamePreview = document.createElement('div');
    usernamePreview.textContent = 'Username: username@nearcheck';
    usernamePreview.style.fontSize = '12px';
    usernamePreview.style.color = 'var(--text-secondary)';
    usernamePreview.style.marginTop = '4px';

    nameInput.oninput = () => {
        const username = generateUsername(nameInput.value);
        usernamePreview.textContent = `Username: ${username}`;
    };

    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    nameGroup.appendChild(usernamePreview);

    // Email
    const emailGroup = document.createElement('div');
    emailGroup.style.display = 'flex';
    emailGroup.style.flexDirection = 'column';
    emailGroup.style.gap = '4px';

    const emailLabel = document.createElement('label');
    emailLabel.textContent = 'Email Address';
    emailLabel.style.fontWeight = '500';

    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.placeholder = 'Enter your email';
    emailInput.required = true;
    emailInput.style.padding = '12px';
    emailInput.style.border = '1px solid var(--border-color)';
    emailInput.style.borderRadius = '8px';

    emailGroup.appendChild(emailLabel);
    emailGroup.appendChild(emailInput);

    // Password
    const passwordGroup = document.createElement('div');
    passwordGroup.style.display = 'flex';
    passwordGroup.style.flexDirection = 'column';
    passwordGroup.style.gap = '4px';

    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = 'Password';
    passwordLabel.style.fontWeight = '500';

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Create a password (min 6 chars)';
    passwordInput.minLength = 6;
    passwordInput.required = true;
    passwordInput.style.padding = '12px';
    passwordInput.style.border = '1px solid var(--border-color)';
    passwordInput.style.borderRadius = '8px';

    passwordGroup.appendChild(passwordLabel);
    passwordGroup.appendChild(passwordInput);

    // Confirm password
    const confirmGroup = document.createElement('div');
    confirmGroup.style.display = 'flex';
    confirmGroup.style.flexDirection = 'column';
    confirmGroup.style.gap = '4px';

    const confirmLabel = document.createElement('label');
    confirmLabel.textContent = 'Confirm Password';
    confirmLabel.style.fontWeight = '500';

    const confirmInput = document.createElement('input');
    confirmInput.type = 'password';
    confirmInput.placeholder = 'Confirm your password';
    confirmInput.required = true;
    confirmInput.style.padding = '12px';
    confirmInput.style.border = '1px solid var(--border-color)';
    confirmInput.style.borderRadius = '8px';

    confirmGroup.appendChild(confirmLabel);
    confirmGroup.appendChild(confirmInput);

    // Section ID (if provided in URL)
    if (sectionId) {
        const sectionGroup = document.createElement('div');
        sectionGroup.style.display = 'flex';
        sectionGroup.style.flexDirection = 'column';
        sectionGroup.style.gap = '4px';

        const sectionLabel = document.createElement('label');
        sectionLabel.textContent = 'Section ID';
        sectionLabel.style.fontWeight = '500';

        const sectionInput = document.createElement('input');
        sectionInput.type = 'text';
        sectionInput.value = sectionId;
        sectionInput.readOnly = true;
        sectionInput.style.padding = '12px';
        sectionInput.style.border = '1px solid var(--border-color)';
        sectionInput.style.borderRadius = '8px';
        sectionInput.style.backgroundColor = 'var(--surface-color)';

        sectionGroup.appendChild(sectionLabel);
        sectionGroup.appendChild(sectionInput);
        form.appendChild(sectionGroup);
    }

    // Age checkbox
    const ageGroup = document.createElement('div');
    ageGroup.style.display = 'flex';
    ageGroup.style.alignItems = 'center';
    ageGroup.style.gap = '8px';
    ageGroup.style.marginTop = '8px';

    const ageCheckbox = document.createElement('input');
    ageCheckbox.type = 'checkbox';
    ageCheckbox.id = 'age';
    ageCheckbox.required = true;

    const ageLabel = document.createElement('label');
    ageLabel.htmlFor = 'age';
    ageLabel.textContent = 'I confirm that I am 13 years old or older';
    ageLabel.style.fontSize = '14px';

    ageGroup.appendChild(ageCheckbox);
    ageGroup.appendChild(ageLabel);

    form.appendChild(nameGroup);
    form.appendChild(emailGroup);
    form.appendChild(passwordGroup);
    form.appendChild(confirmGroup);
    form.appendChild(ageGroup);

    const modal = createModal('Student Sign Up', form, [{
            text: 'Cancel',
            action: () => showWelcomeScreen(),
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Continue',
            action: async () => {
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }

                if (passwordInput.value !== confirmInput.value) {
                    showToast('Passwords do not match', 'error');
                    return;
                }

                if (passwordInput.value.length < 6) {
                    showToast('Password must be at least 6 characters', 'error');
                    return;
                }

                try {
                    await signUp(
                        nameInput.value.trim(),
                        emailInput.value.trim(),
                        passwordInput.value,
                        'student',
                        sectionId
                    );
                } catch (error) {
                    console.error('Sign up error:', error);
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Show sign in form
function showSignIn() {
    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '16px';
    form.style.width = '100%';
    form.style.maxWidth = '400px';

    // Email/username
    const emailGroup = document.createElement('div');
    emailGroup.style.display = 'flex';
    emailGroup.style.flexDirection = 'column';
    emailGroup.style.gap = '4px';

    const emailLabel = document.createElement('label');
    emailLabel.textContent = 'Email or Username';
    emailLabel.style.fontWeight = '500';

    const emailInput = document.createElement('input');
    emailInput.type = 'text';
    emailInput.placeholder = 'Enter your email or username';
    emailInput.required = true;
    emailInput.style.padding = '12px';
    emailInput.style.border = '1px solid var(--border-color)';
    emailInput.style.borderRadius = '8px';

    emailGroup.appendChild(emailLabel);
    emailGroup.appendChild(emailInput);

    // Password
    const passwordGroup = document.createElement('div');
    passwordGroup.style.display = 'flex';
    passwordGroup.style.flexDirection = 'column';
    passwordGroup.style.gap = '4px';

    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = 'Password';
    passwordLabel.style.fontWeight = '500';

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Enter your password';
    passwordInput.required = true;
    passwordInput.style.padding = '12px';
    passwordInput.style.border = '1px solid var(--border-color)';
    passwordInput.style.borderRadius = '8px';

    passwordGroup.appendChild(passwordLabel);
    passwordGroup.appendChild(passwordInput);

    // Forgot password
    const forgotPassword = document.createElement('div');
    forgotPassword.style.textAlign = 'right';

    const forgotLink = document.createElement('button');
    forgotLink.className = 'text-button';
    forgotLink.textContent = 'Forgot password?';
    forgotLink.style.color = 'var(--primary-color)';
    forgotLink.style.fontSize = '14px';
    forgotLink.onclick = () => {
        showForgotPasswordModal();
        document.querySelector('.modal-overlay')?.remove();
    };

    forgotPassword.appendChild(forgotLink);

    form.appendChild(emailGroup);
    form.appendChild(passwordGroup);
    form.appendChild(forgotPassword);

    const modal = createModal('Sign In', form, [{
            text: 'Cancel',
            action: () => showWelcomeScreen(),
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Continue',
            action: async () => {
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }

                try {
                    await signIn(emailInput.value.trim(), passwordInput.value);
                } catch (error) {
                    console.error('Sign in error:', error);
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// Show forgot password modal
function showForgotPasswordModal() {
    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '16px';
    form.style.width = '100%';
    form.style.maxWidth = '400px';

    // Email
    const emailGroup = document.createElement('div');
    emailGroup.style.display = 'flex';
    emailGroup.style.flexDirection = 'column';
    emailGroup.style.gap = '4px';

    const emailLabel = document.createElement('label');
    emailLabel.textContent = 'Email Address';
    emailLabel.style.fontWeight = '500';

    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.placeholder = 'Enter your email';
    emailInput.required = true;
    emailInput.style.padding = '12px';
    emailInput.style.border = '1px solid var(--border-color)';
    emailInput.style.borderRadius = '8px';

    emailGroup.appendChild(emailLabel);
    emailGroup.appendChild(emailInput);

    form.appendChild(emailGroup);

    const modal = createModal('Reset Password', form, [{
            text: 'Cancel',
            action: () => showSignIn(),
            style: {
                background: 'none',
                color: 'var(--text-color)'
            }
        },
        {
            text: 'Send Reset Link',
            action: async () => {
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }

                try {
                    await sendPasswordResetEmail(emailInput.value.trim());
                    modal.close();
                    showSignIn();
                } catch (error) {
                    console.error('Reset password error:', error);
                }
            },
            style: {
                background: 'var(--primary-color)',
                color: 'white'
            }
        }
    ]);
}

// =============================================
// Initialization
// =============================================

// Initialize the app
async function initApp() {
    // Check authentication state
    await checkAuth();

    // Apply theme based on system preference
    applyTheme(currentTheme);

    // Set up service worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }).catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
        });
    }

    // Request notification permission
    if ('Notification' in window) {
        notificationPermission = Notification.permission;

        if (notificationPermission !== 'granted') {
            Notification.requestPermission().then(permission => {
                notificationPermission = permission;
            });
        }
    }

    // Request FCM token if notifications are enabled
    if (notificationPermission === 'granted') {
        try {
            const token = await messaging.getToken();
            if (token) {
                fcmToken = token;

                // Save token to user document
                if (currentUser) {
                    await db.collection('users').doc(currentUser.uid).update({
                        fcmToken: token
                    });
                }
            }
        } catch (error) {
            console.error('FCM token error:', error);
        }
    }

    // Listen for FCM messages
    messaging.onMessage(payload => {
        console.log('Message received:', payload);

        const notification = payload.notification;
        if (notification) {
            showToast(notification.body, 'info');

            // Play sound if enabled
            if (currentUser?.preferences?.voiceAnnouncements) {
                const speech = new SpeechSynthesisUtterance(notification.body);
                window.speechSynthesis.speak(speech);
            }
        }
    });
}

// Start the app
document.addEventListener('DOMContentLoaded', initApp);