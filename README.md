# Lumin Drug Navigator

## Overview

Lumin Drug Navigator is an advanced AI-powered clinical decision support platform designed to help healthcare professionals manage and respond to drug shortages. The application integrates with the Canadian Drug Shortages API and provides dual AI assistance through both OpenAI's GPT models and the specialized TxAgent (mims-harvard/TxAgent-T1-Llama-3.1-8B) model for pharmaceutical and therapeutic reasoning.

## Key Features

### 🔍 **Drug Shortage Intelligence**
- Real-time search and analysis of Canadian drug shortage data
- Integration with Health Canada's drug shortage database
- Comprehensive shortage reports with detailed pharmaceutical information
- Mock data fallback when API credentials are unavailable

### 🤖 **Dual AI Assistant Architecture**
- **OpenAI GPT Models**: General conversation and document editing
- **TxAgent**: Specialized clinical decision support LLM trained in therapeutic reasoning
- **Two Assistant Types**:
  - **Shortage Assistant**: Analyzes shortage data and provides clinical recommendations
  - **Document Assistant**: Generates comprehensive shortage management plans

### 📄 **Clinical Document Generation**
- AI-generated drug shortage clinical response templates
- Comprehensive therapeutic alternative analysis
- Conservation strategy recommendations
- Subpopulation-specific guidance (pediatric, renal, pregnant/lactating, elderly)
- Professional markdown-formatted documents
- PDF export capabilities

### 💬 **Intelligent Session Management**
- Persistent chat conversations across AI models
- Session history and restoration
- Cross-model conversation continuity
- Real-time model switching (OpenAI ↔ TxAgent)

### 🔐 **Enterprise Authentication**
- Supabase-based user authentication
- Secure session management
- Role-based access control

## Technology Stack

### **Frontend**
- **React 18** with TypeScript
- **Vite** for build tooling and development
- **Tailwind CSS** + **shadcn/ui** component library
- **React Router** for navigation
- **TanStack Query** for state management and caching
- **React Hook Form** with Zod validation

### **Backend & Infrastructure**
- **Supabase** for database, authentication, and edge functions
- **PostgreSQL** database with custom RPC functions
- **Deno** runtime for serverless functions

### **AI Integration**
- **OpenAI API** (GPT models) for general assistance
- **TxAgent via RunPod** (mims-harvard/TxAgent-T1-Llama-3.1-8B) for clinical reasoning
- **Intelligent fallback system** between AI models

### **External APIs**
- **Drug Shortages Canada API** for real-time shortage data
- **RxNorm API** for drug name normalization

### **Document Processing**
- **React Markdown** for document rendering
- **jsPDF** + **html2canvas** for PDF generation
- **Markdown-based** document editing

## Installation and Setup

### Prerequisites
- **Node.js** v16 or later
- **npm** or **yarn** package manager
- **Supabase** account and project
- **OpenAI API** key
- **RunPod API** key (for TxAgent)
- **Drug Shortages Canada API** credentials (optional - mock data available)

### Environment Configuration

Create a `.env` file in the project root:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# AI Model APIs
OPENAI_API_KEY=your_openai_api_key
RUNPOD_API_KEY=your_runpod_api_key

# Drug Shortage API (Optional)
VITE_DRUG_SHORTAGE_API_EMAIL=your_api_email
VITE_DRUG_SHORTAGE_API_PASSWORD=your_api_password
```

### Installation Steps

```bash
# Clone the repository
git clone <repository-url>
cd lumin-drug-navigator

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Supabase Setup

1. Create a new Supabase project
2. Run the database migrations from `supabase/migrations/`
3. Deploy the edge functions:
   ```bash
   # Deploy OpenAI assistant function
   supabase functions deploy openai-assistant

   # Deploy drug shortage API function
   supabase functions deploy drug-shortage-api
   ```
4. Configure environment variables in Supabase dashboard

## Application Architecture

### Component Structure
```
src/
├── components/
│   ├── auth/              # Authentication components
│   ├── session/           # Chat interface and session management
│   ├── drug-search/       # Drug search functionality
│   ├── layout/            # Application layout and navigation
│   └── ui/                # Reusable UI components (shadcn/ui)
├── hooks/
│   ├── use-openai-assistant.ts  # AI assistant management
│   └── use-drug-shortages.ts    # Drug shortage data handling
├── integrations/
│   ├── supabase/          # Supabase client and utilities
│   ├── drugShortage/      # Drug shortage API integration
│   └── rxnorm.ts          # RxNorm API integration
├── pages/                 # Main application pages
└── types/                 # TypeScript type definitions
```

### Supabase Functions
```
supabase/functions/
├── openai-assistant/      # Dual AI model handler
│   └── index.ts          # OpenAI + TxAgent integration
└── drug-shortage-api/     # Drug shortage data proxy
    └── index.ts          # Canadian API integration
```

## Usage Guide

### Searching for Drug Shortages
1. Navigate to the Dashboard
2. Search for drugs by name using the search interface
3. Select a drug to view detailed shortage information
4. Access comprehensive shortage reports and analysis

### Using the AI Assistants

#### Shortage Analysis
1. Select a drug shortage
2. Choose your preferred AI model (OpenAI or TxAgent)
3. Ask questions about:
   - Therapeutic alternatives
   - Conservation strategies
   - Clinical impact assessment
   - Patient prioritization strategies

#### Document Generation
1. Select a drug shortage for analysis
2. Navigate to the Document tab
3. Choose TxAgent for clinical document generation
4. Review and edit the generated shortage management plan
5. Export as professional PDF

### Model Switching
- **OpenAI Models**: Best for general questions and document editing
- **TxAgent**: Specialized for clinical decision support and therapeutic reasoning
- Switch between models seamlessly during conversations
- Conversation history is preserved across model switches

## Key Features Deep Dive

### AI-Generated Clinical Documents
The system generates comprehensive drug shortage clinical response templates including:
- **Current Product Shortage Status**: Molecule information, formulations affected, market alternatives
- **Major Indications**: On-label and off-label uses
- **Therapeutic Alternatives by Indication**: Evidence-based alternatives with clinical notes
- **Subpopulations of Concern**: Specific guidance for vulnerable populations
- **Clinical Considerations**: Conservation strategies, communication needs, reconstitution practices

### Intelligent Fallback System
- Primary: TxAgent for clinical document generation
- Fallback: OpenAI for general assistance and editing
- Graceful degradation when APIs are unavailable
- Mock data support for development and demonstration

### Session Persistence
- All conversations are saved to Supabase
- Documents are versioned and retrievable
- Session history across AI models
- Restore conversations from any point

## Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run build:dev    # Build in development mode
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

### Database Schema
The application uses several PostgreSQL functions and tables:
- `ai_interactions` - Store AI conversations
- `ai_documents` - Store generated documents
- `save_ai_conversation()` - RPC function for conversation storage
- `get_ai_conversation()` - RPC function for conversation retrieval
- `save_session_document()` - RPC function for document storage

### API Integration Points
1. **Drug Shortages Canada API** - Real-time shortage data
2. **OpenAI API** - General AI assistance
3. **RunPod API** - TxAgent clinical reasoning
4. **RxNorm API** - Drug name normalization

## Configuration

### AI Model Configuration
- **TxAgent**: `mims-harvard/TxAgent-T1-Llama-3.1-8B` via RunPod
- **OpenAI**: GPT models via OpenAI API
- **Timeouts**: 3 minutes for document generation, 45 seconds for chat
- **Retry Logic**: Exponential backoff for TxAgent requests

### Feature Flags
- `generateDocument`: Enable/disable document generation
- `rawApiData`: Send raw API data to AI models
- `autoInitialize`: Automatically initialize AI assistants

## Security Considerations
- All API keys stored as Supabase secrets
- Row-level security on database tables
- CORS configuration for secure API access
- User authentication required for all features

## License
This project is proprietary and confidential.

---

*Powered by MaaTRx - Advanced Clinical Decision Support*
