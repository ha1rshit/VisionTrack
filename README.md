# SmartRoom Vision 🧠👥

A real-time AI-powered people detection and tracking web application that uses your webcam to monitor room occupancy and provide intelligent insights.

## ✨ Features

### Core Functionality
- **Real-time Person Detection**: Uses TensorFlow.js and Coco SSD to detect people in webcam feed
- **Live People Counter**: Displays current number of people in the room
- **Entry/Exit Tracking**: Automatically detects when people enter or leave
- **Voice Announcements**: Speaks when someone enters or leaves the room

### Smart Features
- **Motion Activity Bar**: Visual indicator of movement intensity
- **Background Blur**: Highlights detected people with blurred background
- **Auto-Screenshot**: Automatically captures frames when someone enters
- **AI Summary Mode**: Provides periodic summaries of room activity
- **Sound Alerts**: Distinct chimes for entry and exit events
- **Dark/Light Theme**: Toggle between themes for better visibility

### User Interface
- **Live Webcam Feed**: Full-screen camera view with overlay graphics
- **Activity Log**: Timestamped log of all entries and exits
- **Control Panel**: Easy access to all features and settings
- **Responsive Design**: Works on desktop and laptop cameras

## 🚀 Getting Started

1. **Open the Application**
   ```bash
   # Simply open index.html in your web browser
   open index.html
   ```

2. **Grant Camera Permissions**
   - Allow camera access when prompted
   - The application will start automatically

3. **Start Using**
   - The AI model will load and begin detection
   - Voice announcements will start when people are detected

## 🎛️ Controls

| Button | Function | Description |
|--------|----------|-------------|
| 🔊/🔇 | Mute/Unmute | Toggle speech announcements |
| 🎭 | Background Blur | Enable/disable background blur effect |
| 🌙/☀️ | Theme Toggle | Switch between dark and light themes |
| 📸 | Screenshot | Manually capture current frame |

## 🔧 Technical Details

### Technologies Used
- **TensorFlow.js**: Machine learning for person detection
- **Coco SSD Model**: Pre-trained model for object detection
- **Web Speech API**: Text-to-speech for announcements
- **Web Audio API**: Sound effects for alerts
- **Canvas API**: Overlay graphics and effects

### Performance
- **Real-time Detection**: ~10-15 FPS depending on hardware
- **Model Size**: ~5MB (loaded once)
- **Memory Usage**: Optimized for continuous operation

### Browser Compatibility
- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Partial support (no background blur)

## 📋 Requirements

- **Webcam**: Required for video input
- **HTTPS**: Required for camera access in production
- **Modern Browser**: Chrome 80+, Firefox 75+, Safari 13+

## 🛠️ Development

### Project Structure
```
├── index.html          # Main HTML structure
├── styles.css          # Dark theme styling with neon accents
└── app.js             # Core application logic
```

### Key Components
- **SmartRoomVision Class**: Main application controller
- **Webcam Handler**: Manages camera permissions and video stream
- **AI Detection Loop**: Continuous person detection and tracking
- **UI Manager**: Handles controls, themes, and visual feedback

## 🎯 Use Cases

### Security & Monitoring
- **Room Occupancy Tracking**: Monitor how many people are in a space
- **Entry/Exit Logging**: Keep records of movement patterns
- **Automated Alerts**: Get notified of activity changes

### Creative AI Demos
- **Interactive Installations**: Art projects with people detection
- **Smart Home Prototypes**: Test IoT concepts with computer vision
- **Educational Tools**: Learn about AI and computer vision

### Business Applications
- **Retail Analytics**: Track customer flow in stores
- **Office Management**: Monitor meeting room usage
- **Event Management**: Count attendees at gatherings

## 🔒 Privacy & Security

- **Local Processing**: All detection happens in your browser
- **No Data Storage**: Video frames are not saved or transmitted
- **Camera Permissions**: Only active when application is running
- **User Control**: Easy to disable camera and microphone

## 🐛 Troubleshooting

### Common Issues

**Camera not working:**
- Ensure HTTPS is enabled (required for camera access)
- Check browser permissions for camera
- Try refreshing the page

**AI model not loading:**
- Check internet connection
- Try a different browser
- Clear browser cache

**Poor detection accuracy:**
- Ensure good lighting conditions
- Stay within camera frame
- Avoid crowded or cluttered backgrounds

## 📈 Future Enhancements

- [ ] Face recognition for individual tracking
- [ ] Age/gender estimation
- [ ] Emotion detection
- [ ] Integration with IoT devices
- [ ] Mobile app version
- [ ] Cloud dashboard for analytics

## 📝 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- **TensorFlow.js Team**: For the amazing machine learning framework
- **Coco Dataset Contributors**: For the person detection training data
- **Web APIs**: Canvas, MediaDevices, Speech Synthesis, Web Audio

---

**Made with ❤️ for AI-powered computer vision applications**
