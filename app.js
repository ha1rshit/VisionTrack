// SmartRoom Vision - Persistent Multi-Person Tracker
class SmartRoomVision {
    constructor() {
        this.video = document.getElementById('webcam');
        this.canvas = document.getElementById('overlay');
        this.overlayCtx = this.canvas.getContext('2d');

        // Tracking state
        this.trackedPeople = new Map(); // localId -> person data
        this.nextLocalId = 1;
        // Demo mode flag
        this.isDemoMode = false;
        this.demoInterval = null;

        // Performance tracking
        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = Date.now();
        this.detectionThrottleMs = 200;

        // Settings
        this.settings = {
            trackerTimeoutSeconds: 5,
            reappearThresholdSeconds: 10,
            maxStorageItems: 200,
            detectionThrottleMs: 200,
            autoExport: true,
            faceBlur: true
        };

        // Statistics
        this.stats = {
            totalEntered: 0,
            totalLeft: 0,
            currentInRoom: 0,
            peakOccupancy: 0,
            totalSessions: 0
        };

        // Storage
        this.db = null;
        this.storedImages = new Map();
        this.eventLog = [];

        // Announcement queue system
        this.announcementQueue = [];
        this.isAnnouncing = false;
        this.announcementDelay = 2000; // 2 seconds between announcements

        this.init();
    }

    async init() {
        try {
            // Initialize storage first
            await this.initStorage();

            // Try to initialize camera first - this will request permission
            try {
                await this.startWebcam();
                this.showNotification('Camera initialized successfully', 'success');
            } catch (cameraError) {
                console.warn('Camera access failed:', cameraError);
                this.showNotification('Camera access denied or unavailable, switching to demo mode', 'warning');
                this.startDemoMode();
            }

            // Load AI model
            await this.loadModel();

            // Setup UI controls
            this.setupControls();

            // Setup sound alerts
            this.setupSoundAlerts();

            // Start detection loop (real or demo)
            if (!this.isDemoMode) {
                this.startDetection();
            }

            this.showNotification('🎉 SmartRoom Vision is ready!', 'success');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    async initStorage() {
        try {
            // Initialize IndexedDB
            this.db = await this.openDB();
            await this.loadStoredImages();
            await this.loadEventLog();
            await this.loadStats();
        } catch (error) {
            console.error('Storage initialization failed:', error);
            this.showNotification('Storage initialization failed, using localStorage fallback', 'warning');
        }
    }

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('SmartRoomVision', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Images store
                if (!db.objectStoreNames.contains('images')) {
                    const imagesStore = db.createObjectStore('images', { keyPath: 'localId' });
                    imagesStore.createIndex('timestamp', 'firstSeenTimestamp');
                }

                // Events store
                if (!db.objectStoreNames.contains('events')) {
                    const eventsStore = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
                    eventsStore.createIndex('timestamp', 'timestamp');
                    eventsStore.createIndex('type', 'eventType');
                }

                // Stats store
                if (!db.objectStoreNames.contains('stats')) {
                    db.createObjectStore('stats', { keyPath: 'id' });
                }

                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'id' });
                }
            };
        });
    }

    async loadStoredImages() {
        try {
            const transaction = this.db.transaction(['images'], 'readonly');
            const store = transaction.objectStore('images');
            const request = store.getAll();

            return new Promise((resolve, reject) => {
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    request.result.forEach(image => {
                        this.storedImages.set(image.localId, image);
                    });
                    resolve();
                };
            });
        } catch (error) {
            console.error('Failed to load stored images:', error);
        }
    }

    async loadEventLog() {
        try {
            const transaction = this.db.transaction(['events'], 'readonly');
            const store = transaction.objectStore('events');
            const index = store.index('timestamp');
            const request = index.getAll();

            return new Promise((resolve, reject) => {
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.eventLog = request.result.sort((a, b) => b.timestamp - a.timestamp);
                    this.updateTimeline();
                    resolve();
                };
            });
        } catch (error) {
            console.error('Failed to load event log:', error);
        }
    }

    async loadStats() {
        try {
            const transaction = this.db.transaction(['stats'], 'readonly');
            const store = transaction.objectStore('stats');
            const request = store.get('main');

            return new Promise((resolve, reject) => {
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    if (request.result) {
                        this.stats = { ...this.stats, ...request.result };
                    }
                    this.updateStatsDisplay();
                    resolve();
                };
            });
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    async loadSettings() {
        try {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get('main');

            return new Promise((resolve, reject) => {
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    if (request.result) {
                        this.settings = { ...this.settings, ...request.result };
                        this.applySettingsToUI();
                    }
                    resolve();
                };
            });
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async startWebcam() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                }
            });

            this.video.srcObject = stream;
            this.video.style.display = 'block';

            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    resolve();
                };
            });
        } catch (error) {
            throw new Error('Camera access denied or unavailable');
        }
    }

    startDemoMode() {
        this.isDemoMode = true;

        // Hide video element and show demo message
        const video = document.getElementById('webcam');
        video.style.display = 'none';

        // Create demo overlay
        const demoOverlay = document.createElement('div');
        demoOverlay.id = 'demo-overlay';
        demoOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #00ffff;
            font-size: 1.2rem;
            font-weight: 600;
            text-align: center;
            border-radius: 15px;
            z-index: 10;
        `;
        demoOverlay.innerHTML = `
            <div style="margin-bottom: 1rem;">🎭 Demo Mode</div>
            <div style="font-size: 0.9rem; color: #cccccc;">Camera not available<br>Simulated tracking active</div>
        `;

        const videoContainer = document.querySelector('.video-container');
        videoContainer.appendChild(demoOverlay);

        // Start demo simulation
        this.startDemoSimulation();
    }

    startDemoSimulation() {
        // Simulate person detection every 3-8 seconds
        const simulateDetection = () => {
            if (this.isDemoMode && !this.isPaused) {
                // Randomly add or remove people (weighted towards realistic patterns)
                const action = Math.random();

                if (action < 0.4 && this.stats.currentInRoom < 5) {
                    // Add a person
                    this.simulatePersonEntry();
                } else if (action < 0.7 && this.stats.currentInRoom > 0) {
                    // Remove a person
                    this.simulatePersonExit();
                }
                // 30% chance of no change (person staying)

                // Schedule next simulation
                const nextDelay = 3000 + Math.random() * 5000; // 3-8 seconds
                setTimeout(simulateDetection, nextDelay);
            }
        };

        // Start simulation loop
        setTimeout(simulateDetection, 1000);
    }

    simulatePersonEntry() {
        const localId = this.nextLocalId++;
        const currentTime = Date.now();

        // Create mock person data
        const mockPerson = {
            localId,
            firstSeenTimestamp: currentTime,
            lastSeenTimestamp: currentTime,
            bbox: this.generateMockBbox(),
            confidence: 0.8 + Math.random() * 0.2
        };

        this.trackedPeople.set(localId, mockPerson);

        // Handle entry logic (reuse existing method)
        this.stats.totalEntered++;
        this.stats.currentInRoom++;
        this.stats.peakOccupancy = Math.max(this.stats.peakOccupancy, this.stats.currentInRoom);

        // Create mock photo
        this.createMockPhoto(localId);

        // Add event to log
        const event = {
            eventType: 'ENTRY',
            localId,
            timestamp: currentTime
        };
        this.eventLog.unshift(event);
        this.saveEvent(event);

        // Update UI
        this.updateStatsDisplay();
        this.updateTimeline();
        this.updateCurrentPeopleDisplay();

        // Add sequential announcement for demo mode (no speech, just visual feedback)
        const entryCount = this.announcementQueue.filter(a => a.text && a.text.includes('entered')).length + 1;
        const announcementText = entryCount === 1 ?
            'A person entered the room' :
            `A ${this.getOrdinalNumber(entryCount)} person entered the room`;

        this.addToAnnouncementQueue(announcementText);
    }

    simulatePersonExit() {
        if (this.trackedPeople.size === 0) return;

        // Pick a random person to exit
        const localIds = Array.from(this.trackedPeople.keys());
        const exitId = localIds[Math.floor(Math.random() * localIds.length)];

        this.handleExit(exitId);
    }

    generateMockBbox() {
        // Generate a random bounding box within video dimensions
        const video = document.getElementById('webcam');
        if (!video.videoWidth) {
            return [100, 100, 150, 200]; // Default fallback
        }

        const width = video.videoWidth;
        const height = video.videoHeight;

        // Random position and size (reasonable person dimensions)
        const x = Math.random() * (width - 200) + 50;
        const y = Math.random() * (height - 300) + 50;
        const w = 120 + Math.random() * 80; // 120-200px width
        const h = 160 + Math.random() * 120; // 160-280px height

        return [x, y, w, h];
    }

    createMockPhoto(localId) {
        // Create a simple colored avatar for demo mode
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 160;
        canvas.height = 160;

        // Generate a random color based on localId
        const hue = (localId * 137.5) % 360; // Golden angle approximation for variety
        ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
        ctx.fillRect(0, 0, 160, 160);

        // Add person icon
        ctx.fillStyle = 'white';
        ctx.font = 'bold 80px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('👤', 80, 100);

        // Add ID number
        ctx.fillStyle = 'black';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(localId, 80, 140);

        const imageDataURL = canvas.toDataURL('image/png');

        // Store mock image
        const imageData = {
            localId,
            firstSeenTimestamp: Date.now(),
            imageDataURL
        };

        this.storedImages.set(localId, imageData);
        this.saveImage(imageData);
    }

    async loadModel() {
        try {
            this.showNotification('Loading AI model...', 'info');
            this.model = await cocoSsd.load();
            this.showNotification('AI model loaded successfully', 'success');
        } catch (error) {
            throw new Error(`Failed to load model: ${error.message}`);
        }
    }

    setupControls() {
        // Top controls
        document.getElementById('settings-btn').addEventListener('click', () => this.showSettingsModal());
        document.getElementById('admin-btn').addEventListener('click', () => this.showAdminModal());
        document.getElementById('export-btn').addEventListener('click', () => this.exportData());

        // Live controls
        document.getElementById('mute-btn').addEventListener('click', () => this.toggleMute());
        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('clear-btn').addEventListener('click', () => this.clearStorage());
        document.getElementById('screenshot-btn').addEventListener('click', () => this.takeScreenshot());
        document.getElementById('demo-btn').addEventListener('click', () => this.toggleDemoMode());

        // Settings modal
        document.getElementById('settings-close').addEventListener('click', () => this.hideSettingsModal());
        document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());
        document.getElementById('reset-settings').addEventListener('click', () => this.resetSettings());

        // Admin modal
        document.getElementById('admin-close').addEventListener('click', () => this.hideAdminModal());
        document.getElementById('download-logs').addEventListener('click', () => this.downloadLogs());
        document.getElementById('clear-logs').addEventListener('click', () => this.clearLogs());

        // Tab switching
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchAdminTab(tab.dataset.tab));
        });

        // Outside click to close modals
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideSettingsModal();
                this.hideAdminModal();
            }
        });
    }

    setupSoundAlerts() {
        // Create audio contexts for sound alerts
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create entry sound (chime)
        this.entrySound = this.createTone(800, 0.2, 'sine');

        // Create exit sound (low tone)
        this.exitSound = this.createTone(400, 0.3, 'triangle');
    }

    createTone(frequency, duration, waveType = 'sine') {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = waveType;

        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        return {
            play: () => {
                oscillator.start(this.audioContext.currentTime);
                oscillator.stop(this.audioContext.currentTime + duration);
            }
        };
    }

    startDetection() {
        if (this.isDetecting) return;

        this.isDetecting = true;
        this.detectFrame();
    }

    stopDetection() {
        this.isDetecting = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
    }

    async detectFrame() {
        if (!this.isDetecting || !this.model || this.video.readyState !== 4) {
            this.animationFrame = requestAnimationFrame(() => this.detectFrame());
            return;
        }

        // Throttle detection for performance
        const now = Date.now();
        if (now - this.lastDetectionTime < this.settings.detectionThrottleMs) {
            this.animationFrame = requestAnimationFrame(() => this.detectFrame());
            return;
        }
        this.lastDetectionTime = now;

        try {
            const predictions = await this.model.detect(this.video);

            // Filter for person detections only
            const personDetections = predictions.filter(prediction =>
                prediction.class === 'person' && prediction.score > 0.3
            );

            // Update tracking
            this.updateTracking(personDetections);

            // Draw overlay
            this.drawOverlay();

            // Update UI
            this.updateCurrentPeopleDisplay();
            this.updateStatsDisplay();

        } catch (error) {
            console.error('Detection error:', error);
        }

        this.animationFrame = requestAnimationFrame(() => this.detectFrame());
    }

    updateTracking(detections) {
        const currentTime = Date.now();
        const timeoutThreshold = this.settings.trackerTimeoutSeconds * 1000;

        // Update existing tracks
        for (const [localId, person] of this.trackedPeople.entries()) {
            person.lastSeenTimestamp = currentTime;

            // Check if person has timed out
            if (currentTime - person.firstSeenTimestamp > timeoutThreshold) {
                this.handleExit(localId);
            }
        }

        // Match detections to existing tracks using IoU
        const unmatchedDetections = [...detections];
        const unmatchedTracks = new Set(this.trackedPeople.keys());

        for (const detection of detections) {
            let bestMatch = null;
            let bestIoU = 0;

            for (const [localId, person] of this.trackedPeople.entries()) {
                if (!unmatchedTracks.has(localId)) continue;

                const iou = this.calculateIoU(detection.bbox, person.bbox);
                if (iou > 0.3 && iou > bestIoU) { // IoU threshold
                    bestMatch = localId;
                    bestIoU = iou;
                }
            }

            if (bestMatch !== null) {
                // Update existing track
                const person = this.trackedPeople.get(bestMatch);
                person.bbox = detection.bbox;
                person.lastSeenTimestamp = currentTime;
                unmatchedTracks.delete(bestMatch);
                const detectionIndex = unmatchedDetections.indexOf(detection);
                if (detectionIndex > -1) unmatchedDetections.splice(detectionIndex, 1);
            }
        }

        // Create new tracks for unmatched detections
        for (const detection of unmatchedDetections) {
            const localId = this.nextLocalId++;
            const newPerson = {
                localId,
                firstSeenTimestamp: currentTime,
                lastSeenTimestamp: currentTime,
                bbox: detection.bbox,
                confidence: detection.score
            };

            this.trackedPeople.set(localId, newPerson);
            this.handleEntry(localId, detection.bbox);
        }

        // Handle exits for unmatched tracks
        for (const localId of unmatchedTracks) {
            const person = this.trackedPeople.get(localId);
            if (currentTime - person.lastSeenTimestamp > timeoutThreshold) {
                this.handleExit(localId);
            }
        }
    }

    calculateIoU(bbox1, bbox2) {
        const [x1, y1, w1, h1] = bbox1;
        const [x2, y2, w2, h2] = bbox2;

        const xOverlap = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
        const yOverlap = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));

        const intersection = xOverlap * yOverlap;
        const union = w1 * h1 + w2 * h2 - intersection;

        return union === 0 ? 0 : intersection / union;
    }

    async handleEntry(localId, bbox) {
        this.stats.totalEntered++;
        this.stats.currentInRoom++;
        this.stats.peakOccupancy = Math.max(this.stats.peakOccupancy, this.stats.currentInRoom);

        // Capture and store photo
        await this.capturePersonPhoto(localId, bbox);

        // Add event to log
        const event = {
            eventType: 'ENTRY',
            localId,
            timestamp: Date.now()
        };
        this.eventLog.unshift(event);
        await this.saveEvent(event);

        // Update UI
        this.updateStatsDisplay();
        this.updateTimeline();

        // Add sequential announcement for entry
        const entryCount = this.announcementQueue.filter(a => a.text.includes('entered')).length + 1;
        const announcementText = entryCount === 1 ?
            'A person entered the room' :
            `A ${this.getOrdinalNumber(entryCount)} person entered the room`;

        this.addToAnnouncementQueue(announcementText);

        if (this.entrySound && !this.isMuted) {
            this.entrySound.play();
        }

        this.showNotification(`Person ${localId} entered the room`, 'success');
    }

    async handleExit(localId) {
        if (!this.trackedPeople.has(localId)) return;

        this.stats.totalLeft++;
        this.stats.currentInRoom = Math.max(0, this.stats.currentInRoom - 1);

        this.trackedPeople.delete(localId);

        // Add event to log
        const event = {
            eventType: 'EXIT',
            localId,
            timestamp: Date.now()
        };
        this.eventLog.unshift(event);
        await this.saveEvent(event);

        // Update UI
        this.updateStatsDisplay();
        this.updateTimeline();
        this.updateCurrentPeopleDisplay();

        // Add sequential announcement for exit
        const exitCount = this.announcementQueue.filter(a => a.text.includes('left')).length + 1;
        const announcementText = exitCount === 1 ?
            'A person left the room' :
            `A ${this.getOrdinalNumber(exitCount)} person left the room`;

        this.addToAnnouncementQueue(announcementText);

        if (this.exitSound && !this.isMuted) {
            this.exitSound.play();
        }

        this.showNotification(`Person ${localId} left the room`, 'warning');
    }

    async capturePersonPhoto(localId, bbox) {
        try {
            const [x, y, width, height] = bbox;

            // Create a canvas for the cropped image
            const cropCanvas = document.createElement('canvas');
            const cropCtx = cropCanvas.getContext('2d');

            // Set dimensions for the cropped image (160x160)
            cropCanvas.width = 160;
            cropCanvas.height = 160;

            // Calculate crop area (add some padding)
            const padding = 20;
            const cropX = Math.max(0, x - padding);
            const cropY = Math.max(0, y - padding);
            const cropWidth = Math.min(this.video.videoWidth - cropX, width + padding * 2);
            const cropHeight = Math.min(this.video.videoHeight - cropY, height + padding * 2);

            // Draw the cropped area
            cropCtx.drawImage(
                this.video,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, 160, 160
            );

            // Apply face blur if enabled
            if (this.settings.faceBlur) {
                await this.applyFaceBlur(cropCanvas, cropCtx);
            }

            // Convert to data URL
            const imageDataURL = cropCanvas.toDataURL('image/png');

            // Store in memory and database
            const imageData = {
                localId,
                firstSeenTimestamp: Date.now(),
                imageDataURL
            };

            this.storedImages.set(localId, imageData);
            await this.saveImage(imageData);

            // Update admin UI if open
            this.updateStoredImagesDisplay();

        } catch (error) {
            console.error('Failed to capture person photo:', error);
        }
    }

    async applyFaceBlur(canvas, ctx) {
        // This is a simple blur - in a real implementation, you'd use
        // a face detection library to detect and blur specific face regions
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Simple blur effect - reduce image quality
        for (let i = 0; i < data.length; i += 4) {
            // Reduce color precision
            data[i] = Math.floor(data[i] / 32) * 32;     // Red
            data[i + 1] = Math.floor(data[i + 1] / 32) * 32; // Green
            data[i + 2] = Math.floor(data[i + 2] / 32) * 32; // Blue
        }

        ctx.putImageData(imageData, 0, 0);
    }

    drawOverlay() {
        // Update FPS counter (only in camera mode)
        if (!this.isDemoMode) {
            this.updateFPS();
        }

        // Clear canvas
        this.overlayCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw bounding boxes for tracked people
        for (const [localId, person] of this.trackedPeople.entries()) {
            const [x, y, width, height] = person.bbox;

            // Draw bounding box with glow effect
            this.overlayCtx.shadowColor = '#00ffff';
            this.overlayCtx.shadowBlur = 10;
            this.overlayCtx.strokeStyle = '#00ffff';
            this.overlayCtx.lineWidth = 3;
            this.overlayCtx.strokeRect(x, y, width, height);

            // Reset shadow for text
            this.overlayCtx.shadowBlur = 0;

            // Draw local ID label
            this.overlayCtx.fillStyle = '#00ffff';
            this.overlayCtx.font = 'bold 16px Arial';
            this.overlayCtx.fillText(`ID: ${localId}`, x, y - 10);

            // Draw green dot indicator
            this.overlayCtx.fillStyle = '#00ff88';
            this.overlayCtx.beginPath();
            this.overlayCtx.arc(x + width - 15, y + 15, 8, 0, 2 * Math.PI);
            this.overlayCtx.fill();
        }

        // Draw detection info panel
        this.overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.overlayCtx.fillRect(10, 10, 250, 80);

        this.overlayCtx.fillStyle = '#00ffff';
        this.overlayCtx.font = '20px Arial';
        this.overlayCtx.fillText(`People: ${this.stats.currentInRoom}`, 20, 35);

        if (this.isDemoMode) {
            this.overlayCtx.fillText(`Mode: Demo`, 20, 55);
        } else {
            this.overlayCtx.fillText(`FPS: ${this.fps}`, 20, 55);
        }

        this.overlayCtx.fillStyle = '#ffffff';
        this.overlayCtx.font = '14px Arial';
        this.overlayCtx.fillText(`Status: ${this.isPaused ? 'Paused' : 'Active'}`, 20, 75);
    }

    updateFPS() {
        this.frameCount++;
        const now = Date.now();
        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }

    updateCurrentPeopleDisplay() {
        const grid = document.getElementById('current-people-grid');

        if (this.trackedPeople.size === 0) {
            grid.innerHTML = '<div class="no-people">No people currently detected</div>';
            return;
        }

        grid.innerHTML = '';

        for (const [localId, person] of this.trackedPeople.entries()) {
            const card = document.createElement('div');
            card.className = 'person-card';

            const avatar = document.createElement('img');
            avatar.className = 'person-avatar';
            avatar.src = this.storedImages.get(localId)?.imageDataURL || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiMwMGNjZmYiLz4KPHRleHQgeD0iMjAiIHk9IjI1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmZmZmIiBmb250LXNpemU9IjEyIj5QRVI8L3RleHQ+Cjwvc3ZnPg==';
            avatar.alt = `Person ${localId}`;

            const info = document.createElement('div');
            info.className = 'person-info';

            const id = document.createElement('div');
            id.className = 'person-id';
            id.textContent = `ID: ${localId}`;

            const time = document.createElement('div');
            time.className = 'person-time';
            time.textContent = `Seen: ${Math.floor((Date.now() - person.firstSeenTimestamp) / 1000)}s ago`;

            info.appendChild(id);
            info.appendChild(time);

            card.appendChild(avatar);
            card.appendChild(info);

            grid.appendChild(card);
        }
    }

    updateStatsDisplay() {
        document.getElementById('current-count').textContent = this.stats.currentInRoom;
        document.getElementById('total-entered').textContent = this.stats.totalEntered;
        document.getElementById('total-left').textContent = this.stats.totalLeft;
        document.getElementById('speech-status').textContent = this.isMuted ? 'OFF' : 'ON';

        // Save stats
        this.saveStats();
    }

    updateTimeline() {
        const timeline = document.getElementById('event-timeline');

        if (this.eventLog.length === 0) {
            timeline.innerHTML = '<div class="timeline-item loading">No events yet</div>';
            return;
        }

        timeline.innerHTML = '';

        // Show last 20 events
        const recentEvents = this.eventLog.slice(0, 20);

        for (const event of recentEvents) {
            const item = document.createElement('div');
            item.className = `timeline-item ${event.eventType.toLowerCase()}`;

            const time = document.createElement('div');
            time.className = 'timeline-time';
            time.textContent = new Date(event.timestamp).toLocaleTimeString();

            const content = document.createElement('div');
            content.className = 'timeline-content';

            const avatar = document.createElement('img');
            avatar.className = 'timeline-avatar';
            avatar.src = this.storedImages.get(event.localId)?.imageDataURL || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiMwMGNjZmYiLz4KPHRleHQgeD0iMjAiIHk9IjI1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmZmZmIiBmb250LXNpemU9IjEyIj5QRVI8L3RleHQ+Cjwvc3ZnPg==';
            avatar.alt = `Person ${event.localId}`;

            const text = document.createElement('div');
            text.className = 'timeline-text';
            text.textContent = `Person ${event.localId} ${event.eventType === 'ENTRY' ? 'entered' : 'left'} the room`;

            content.appendChild(avatar);
            content.appendChild(text);

            item.appendChild(time);
            item.appendChild(content);

            timeline.appendChild(item);
        }
    }

    // Storage methods
    async saveImage(imageData) {
        try {
            const transaction = this.db.transaction(['images'], 'readwrite');
            const store = transaction.objectStore('images');
            await store.put(imageData);
        } catch (error) {
            console.error('Failed to save image:', error);
        }
    }

    async saveEvent(event) {
        try {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            await store.add(event);
        } catch (error) {
            console.error('Failed to save event:', error);
        }
    }

    async saveStats() {
        try {
            const transaction = this.db.transaction(['stats'], 'readwrite');
            const store = transaction.objectStore('stats');
            await store.put({ id: 'main', ...this.stats });
        } catch (error) {
            console.error('Failed to save stats:', error);
        }
    }

    async saveSettings() {
        try {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            await store.put({ id: 'main', ...this.settings });
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    // UI Management
    showSettingsModal() {
        document.getElementById('settings-modal').classList.add('active');
        this.applySettingsToUI();
    }

    hideSettingsModal() {
        document.getElementById('settings-modal').classList.remove('active');
    }

    showAdminModal() {
        document.getElementById('admin-modal').classList.add('active');
        this.updateStoredImagesDisplay();
    }

    hideAdminModal() {
        document.getElementById('admin-modal').classList.remove('active');
    }

    switchAdminTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.classList.toggle('active', content.dataset.tab === tabName);
        });

        // Update content based on tab
        if (tabName === 'images') {
            this.updateStoredImagesDisplay();
        } else if (tabName === 'logs') {
            this.updateLogsDisplay();
        } else if (tabName === 'statistics') {
            this.updateStatisticsDisplay();
        }
    }

    applySettingsToUI() {
        document.getElementById('tracker-timeout').value = this.settings.trackerTimeoutSeconds;
        document.getElementById('reappear-threshold').value = this.settings.reappearThresholdSeconds;
        document.getElementById('max-storage').value = this.settings.maxStorageItems;
        document.getElementById('detection-throttle').value = this.settings.detectionThrottleMs;
        document.getElementById('auto-export').checked = this.settings.autoExport;
        document.getElementById('face-blur').checked = this.settings.faceBlur;
    }

    async saveSettings() {
        this.settings.trackerTimeoutSeconds = parseInt(document.getElementById('tracker-timeout').value);
        this.settings.reappearThresholdSeconds = parseInt(document.getElementById('reappear-threshold').value);
        this.settings.maxStorageItems = parseInt(document.getElementById('max-storage').value);
        this.settings.detectionThrottleMs = parseInt(document.getElementById('detection-throttle').value);
        this.settings.autoExport = document.getElementById('auto-export').checked;
        this.settings.faceBlur = document.getElementById('face-blur').checked;

        await this.saveSettings();
        this.hideSettingsModal();
        this.showNotification('Settings saved successfully', 'success');
    }

    resetSettings() {
        this.settings = {
            trackerTimeoutSeconds: 5,
            reappearThresholdSeconds: 10,
            maxStorageItems: 200,
            detectionThrottleMs: 200,
            autoExport: true,
            faceBlur: true
        };
        this.applySettingsToUI();
    }

    updateStoredImagesDisplay() {
        const grid = document.getElementById('stored-images');

        if (this.storedImages.size === 0) {
            grid.innerHTML = '<div class="no-images">No images stored yet</div>';
            return;
        }

        grid.innerHTML = '';

        for (const [localId, imageData] of this.storedImages.entries()) {
            const item = document.createElement('div');
            item.className = 'image-item';

            const thumbnail = document.createElement('img');
            thumbnail.className = 'image-thumbnail';
            thumbnail.src = imageData.imageDataURL;
            thumbnail.alt = `Person ${localId}`;

            const info = document.createElement('div');
            info.className = 'image-info';

            const id = document.createElement('div');
            id.className = 'image-id';
            id.textContent = `ID: ${localId}`;

            const time = document.createElement('div');
            time.className = 'image-time';
            time.textContent = new Date(imageData.firstSeenTimestamp).toLocaleTimeString();

            info.appendChild(id);
            info.appendChild(time);

            item.appendChild(thumbnail);
            item.appendChild(info);

            // Add click handler for full-size view
            item.addEventListener('click', () => {
                this.showFullImage(imageData);
            });

            grid.appendChild(item);
        }
    }

    updateLogsDisplay() {
        const list = document.getElementById('logs-list');

        if (this.eventLog.length === 0) {
            list.innerHTML = '<div class="no-logs">No events logged yet</div>';
            return;
        }

        list.innerHTML = '';

        for (const event of this.eventLog.slice(0, 50)) { // Show last 50 events
            const item = document.createElement('div');
            item.className = 'log-item';

            const time = document.createElement('div');
            time.className = 'log-time';
            time.textContent = new Date(event.timestamp).toLocaleString();

            const content = document.createElement('div');
            content.className = 'log-content';
            content.textContent = `Person ${event.localId} ${event.eventType === 'ENTRY' ? 'entered' : 'left'} the room`;

            item.appendChild(time);
            item.appendChild(content);
            list.appendChild(item);
        }
    }

    updateStatisticsDisplay() {
        document.getElementById('total-sessions').textContent = this.stats.totalSessions || 0;
        document.getElementById('peak-occupancy').textContent = this.stats.peakOccupancy || 0;
        document.getElementById('avg-stay-time').textContent = 'Calculating...';
        document.getElementById('storage-used').textContent = `${this.storedImages.size} images`;
    }

    showFullImage(imageData) {
        // Create a modal for full-size image view
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.zIndex = '2000';

        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '90vw';
        content.style.maxHeight = '90vh';

        const header = document.createElement('div');
        header.className = 'modal-header';

        const title = document.createElement('h2');
        title.textContent = `Person ${imageData.localId}`;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'modal-body';
        body.style.textAlign = 'center';

        const img = document.createElement('img');
        img.src = imageData.imageDataURL;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '70vh';
        img.style.borderRadius = '10px';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn-primary';
        downloadBtn.textContent = 'Download Image';
        downloadBtn.style.marginTop = '1rem';
        downloadBtn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = imageData.imageDataURL;
            a.download = `person-${imageData.localId}-${new Date(imageData.firstSeenTimestamp).toISOString()}.png`;
            a.click();
        });

        body.appendChild(img);
        body.appendChild(downloadBtn);

        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);

        document.body.appendChild(modal);
    }

    // Control methods
    toggleMute() {
        this.isMuted = !this.isMuted;
        document.getElementById('mute-btn').classList.toggle('active', this.isMuted);
        document.getElementById('mute-btn').querySelector('.btn-text').textContent =
            this.isMuted ? 'Unmute Speech' : 'Mute Speech';
    }

    toggleDemoMode() {
        if (this.isDemoMode) {
            // Try to switch back to camera mode
            this.exitDemoMode();
        } else {
            // Switch to demo mode
            this.startDemoMode();
        }
    }

    exitDemoMode() {
        if (!this.isDemoMode) return;

        // Stop demo simulation
        this.isDemoMode = false;

        // Remove demo overlay
        const demoOverlay = document.getElementById('demo-overlay');
        if (demoOverlay) {
            demoOverlay.remove();
        }

        // Show video element
        const video = document.getElementById('webcam');
        video.style.display = 'block';

        // Try to start camera
        this.startWebcam().then(() => {
            this.showNotification('Switched to camera mode', 'success');
            this.startDetection();
        }).catch((error) => {
            this.showNotification('Camera not available, staying in demo mode', 'warning');
            this.startDemoMode();
        });
    }

    async clearStorage() {
        if (!confirm('Are you sure you want to clear all stored data? This cannot be undone.')) {
            return;
        }

        try {
            // Clear IndexedDB
            const transaction = this.db.transaction(['images', 'events', 'stats'], 'readwrite');

            await new Promise((resolve, reject) => {
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);

                transaction.objectStore('images').clear();
                transaction.objectStore('events').clear();
                transaction.objectStore('stats').clear();
            });

            // Clear memory
            this.storedImages.clear();
            this.eventLog = [];
            this.stats = {
                totalEntered: 0,
                totalLeft: 0,
                currentInRoom: 0,
                peakOccupancy: 0,
                totalSessions: 0
            };

            // Update UI
            this.updateStoredImagesDisplay();
            this.updateLogsDisplay();
            this.updateStatisticsDisplay();
            this.updateTimeline();
            this.updateStatsDisplay();

            this.showNotification('All data cleared successfully', 'success');
        } catch (error) {
            console.error('Failed to clear storage:', error);
            this.showNotification('Failed to clear storage', 'error');
        }
    }

    takeScreenshot() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;

        // Draw the current video frame
        ctx.drawImage(this.video, 0, 0);

        // Add overlay information
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, 10, 400, 100);

        ctx.fillStyle = '#00ffff';
        ctx.font = '24px Arial';
        ctx.fillText(`SmartRoom Vision - ${new Date().toLocaleString()}`, 20, 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Arial';
        ctx.fillText(`People in room: ${this.stats.currentInRoom}`, 20, 65);
        ctx.fillText(`Total entered: ${this.stats.totalEntered}`, 20, 85);

        // Download the screenshot
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `smartroom-screenshot-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    // Announcement queue processing
    processAnnouncementQueue() {
        if (this.isAnnouncing || this.announcementQueue.length === 0) {
            return;
        }

        this.isAnnouncing = true;
        const announcement = this.announcementQueue.shift();

        // Only speak in real camera mode, not demo mode
        if (!this.isDemoMode && !this.isMuted) {
            this.speak(announcement.text);
        }

        // Schedule next announcement after delay
        setTimeout(() => {
            this.isAnnouncing = false;
            this.processAnnouncementQueue();
        }, this.announcementDelay);
    }

    getOrdinalNumber(num) {
        const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
        return ordinals[num - 1] || `${num}th`;
    }

    showNotification(message, type = 'info') {
        const notifications = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        notifications.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    // Data export/import methods
    exportData() {
        const exportData = {
            settings: this.settings,
            stats: this.stats,
            eventLog: this.eventLog,
            images: Array.from(this.storedImages.values()),
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `smartroom-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showNotification('Data exported successfully', 'success');
    }

    async importData(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Validate data structure
            if (!data.settings || !data.stats || !data.eventLog) {
                throw new Error('Invalid export file format');
            }

            // Confirm import
            if (!confirm(`Import data from ${new Date(data.exportedAt).toLocaleString()}? This will overwrite current data.`)) {
                return;
            }

            // Import settings
            this.settings = { ...this.settings, ...data.settings };

            // Import stats
            this.stats = { ...this.stats, ...data.stats };

            // Import events
            this.eventLog = data.eventLog;

            // Import images
            this.storedImages.clear();
            for (const imageData of data.images) {
                this.storedImages.set(imageData.localId, imageData);
            }

            // Save to database
            await this.saveSettings();
            await this.saveStats();

            // Clear and repopulate events
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            await store.clear();

            for (const event of this.eventLog) {
                await store.add(event);
            }

            // Clear and repopulate images
            const imageTransaction = this.db.transaction(['images'], 'readwrite');
            const imageStore = imageTransaction.objectStore('images');
            await imageStore.clear();

            for (const imageData of data.images) {
                await imageStore.add(imageData);
            }

            // Update UI
            this.applySettingsToUI();
            this.updateStatsDisplay();
            this.updateTimeline();
            this.updateStoredImagesDisplay();

            this.showNotification('Data imported successfully', 'success');
        } catch (error) {
            console.error('Import failed:', error);
            this.showNotification('Import failed: ' + error.message, 'error');
        }
    }

    downloadLogs() {
        const logsData = {
            eventLog: this.eventLog,
            stats: this.stats,
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(logsData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `smartroom-logs-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showNotification('Logs downloaded successfully', 'success');
    }

    async clearLogs() {
        if (!confirm('Are you sure you want to clear all event logs? Images will be preserved.')) {
            return;
        }

        try {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            await store.clear();

            this.eventLog = [];
            this.updateTimeline();
            this.updateLogsDisplay();

            this.showNotification('Logs cleared successfully', 'success');
        } catch (error) {
            console.error('Failed to clear logs:', error);
            this.showNotification('Failed to clear logs', 'error');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SmartRoomVision();
});
