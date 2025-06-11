# Lumin Drug Navigator

## Overview

Lumin Drug Navigator is an AI-powered application designed to help healthcare professionals manage and respond to drug shortages. The application provides comprehensive information about drug shortages, allows for interactive discussions with an AI assistant about therapeutic alternatives and conservation strategies, and helps create detailed drug shortage management plans that can be exported as professional PDF documents.

## Technology Stack

- **Frontend**: React with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: React Hooks
- **Backend**: Supabase for database and serverless functions
- **AI Integration**: OpenAI API for AI assistance
- **PDF Generation**: jsPDF and html2canvas
- **Routing**: React Router

## Key Features

### 1. Drug Shortage Information
- Search for drugs with reported shortages
- View detailed information about drug shortages
- Access comprehensive data from official sources

### 2. AI Assistant
- Interactive chat interface for discussing drug shortages
- Two assistant modes:
  - **Information Mode**: Ask questions about specific drug shortages, alternatives, and conservation strategies
  - **Document Mode**: Get help creating and editing drug shortage management plans

### 3. Document Management
- Create detailed drug shortage management plans
- AI-assisted document generation based on shortage data
- Markdown-based document editing
- Real-time preview of document formatting
- Export documents as professional PDFs in A4 format

### 4. Session Management
- Save and load chat conversations
- Store generated documents
- Track drug shortage analysis history

## Application Structure

The application is organized into the following key components:

- **Chat Interface**: Handles communication with the AI assistant
- **Document Editor**: Provides tools for creating and editing documents
- **Drug Shortage Info**: Displays detailed information about specific shortages
- **Dashboard**: Central hub for accessing application features

## How It Works

1. **Data Sourcing**: The application retrieves drug shortage information from official databases
2. **AI Processing**: It uses OpenAI's API to analyze shortage data and generate insights
3. **Interactive Assistance**: Users can ask questions about shortages and get detailed responses
4. **Document Generation**: The AI helps create comprehensive shortage management plans
5. **Export Capability**: Documents can be exported as professional PDFs for distribution

## Installation and Setup

### Prerequisites
- Node.js (v16 or later)
- npm or yarn package manager
- Supabase account for backend services
- OpenAI API key for AI functionality

### Installation Steps

```sh
# Clone the repository
git clone <repository-url>

# Navigate to project directory
cd lumin-drug-navigator

# Install dependencies
npm install

# Set up environment variables
# Create a .env file with the following:
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_OPENAI_API_KEY=your_openai_api_key
VITE_RUNPOD_API_KEY=your_runpod_api_key

# Start development server
npm run dev
```

## Usage Guide

### Searching for Drug Shortages
1. Navigate to the Dashboard
2. Use the search bar to find drugs by name
3. Select a drug to view detailed shortage information

### Using the AI Assistant
1. Select a drug shortage to analyze
2. Use the chat interface to ask questions about:
   - Therapeutic alternatives
   - Conservation strategies
   - Impact assessment
   - Implementation plans

### Creating a Shortage Management Plan
1. Select a drug shortage to manage
2. Navigate to the Document tab
3. Use the AI assistant to help generate content
4. Edit the document as needed
5. Export as PDF when complete

### Exporting Documents
1. Navigate to the Document Editor
2. Click the "Export PDF" button
3. The document will be formatted as a professional A4 PDF
4. Save the PDF to your desired location

## Development

### Project Structure

```
src/
├── components/          # UI components
│   ├── session/         # Session-related components
│   ├── ui/              # Reusable UI components
│   └── drug-search/     # Drug search components
├── hooks/               # Custom React hooks
│   ├── use-openai-assistant.ts   # AI assistant functionality
│   └── use-drug-shortages.ts     # Drug shortage data handling
├── integrations/        # External service integrations
│   ├── supabase/        # Supabase client and utilities
│   └── drugShortage/    # Drug shortage API integration
├── pages/               # Main application pages
└── types/               # TypeScript type definitions
```

## License

This project is proprietary and confidential.
