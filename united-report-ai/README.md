# United Airlines AI Report Management System

A comprehensive React Native mobile application for creating and managing AI-powered reports for airline customer complaints and service issues.

## Features

### 🏠 Dashboard
- **Overview Statistics**: View total reports, completed reports, and in-progress reports
- **Quick Actions**: Create new reports with a single tap
- **Recent Reports**: Browse recently created reports with status indicators
- **Modern UI**: Clean, intuitive interface with United Airlines branding

### 💬 AI Chat Interface
- **Intelligent Conversations**: Interact with AI agents for report creation
- **Image Upload**: Upload photos from gallery or take new photos with camera
- **Report Type Selection**: Choose from predefined report categories
- **Real-time Responses**: AI agents provide contextual responses and guidance
- **Haptic Feedback**: Enhanced user experience with tactile responses

### 📋 Reports Management
- **Comprehensive List**: View all generated reports with detailed information
- **Search & Filter**: Find reports by title, description, or status
- **Status Tracking**: Monitor report progress (Pending, In Progress, Completed)
- **Priority Levels**: High, Medium, and Low priority indicators
- **AI Agent Attribution**: Track which AI agent handled each report

## Report Types

The system supports various types of airline-related reports:

- **Customer Complaint**: General customer service issues
- **Service Issue**: Flight delays, cancellations, service quality
- **Booking Problem**: Seat assignments, reservation issues
- **Luggage Issue**: Damaged, lost, or delayed baggage
- **Flight Delay**: Weather, mechanical, or operational delays
- **Safety Concern**: Turbulence, security, or safety-related issues

## Technology Stack

- **React Native**: Cross-platform mobile development
- **Expo**: Development platform and tools
- **React Navigation**: Navigation between screens
- **Expo Image Picker**: Camera and gallery integration
- **Expo Haptics**: Tactile feedback
- **Ionicons**: Icon library

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI
- iOS Simulator or Android Emulator (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd united-report-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

4. **Run on device/simulator**
   ```bash
   # iOS
   npm run ios
   
   # Android
   npm run android
   
   # Web
   npm run web
   ```

## Project Structure

```
united-report-ai/
├── App.js                 # Main application component with navigation
├── screens/
│   ├── DashboardScreen.js # Dashboard with overview and quick actions
│   ├── ChatScreen.js      # AI chat interface for report creation
│   └── ReportsScreen.js   # Reports list with search and filtering
├── assets/                # Images, fonts, and other static assets
├── package.json           # Dependencies and scripts
└── README.md             # Project documentation
```

## Usage

### Creating a New Report

1. **Navigate to Dashboard**: Open the app and view the main dashboard
2. **Tap "Create New Report"**: This opens the AI chat interface
3. **Select Report Type**: Choose the appropriate category for your issue
4. **Upload Images**: Use the camera or gallery to add relevant photos
5. **Chat with AI**: Describe your issue and receive AI assistance
6. **Generate Report**: The AI will help create a comprehensive report

### Managing Reports

1. **View All Reports**: Navigate to the Reports tab
2. **Search Reports**: Use the search bar to find specific reports
3. **Filter by Status**: Use the filter tabs to view reports by status
4. **View Details**: Tap on any report to see full details

## AI Agent Features

- **Natural Language Processing**: Understands user input in natural language
- **Image Analysis**: Analyzes uploaded images for context
- **Contextual Responses**: Provides relevant responses based on conversation history
- **Report Generation**: Automatically generates structured reports
- **Escalation Logic**: Identifies when issues need human intervention

## Permissions

The app requires the following permissions:

- **Camera**: For taking photos of issues
- **Photo Library**: For uploading existing images
- **Haptic Feedback**: For enhanced user experience

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please contact the development team or create an issue in the repository.

---

**United Airlines AI Report Management System** - Streamlining customer service through intelligent automation. 