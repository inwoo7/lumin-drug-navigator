from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import uuid
from datetime import datetime
import asyncio
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import TxAgent components
from transformers import AutoTokenizer
import sys
import os

# Add current directory to Python path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from working_drug_agent import DrugShortageAgent
except ImportError:
    print("Warning: working_drug_agent.py not found. Creating minimal version...")
    # Create a minimal DrugShortageAgent class if the file doesn't exist
    class DrugShortageAgent:
        def __init__(self):
            self.known_drugs = ["acetaminophen", "ibuprofen", "aspirin", "warfarin", "metformin", "lisinopril"]
        
        async def analyze_drug_shortage(self, drug_name: str, shortage_data: dict = None) -> dict:
            return {
                "analysis": f"Basic analysis for {drug_name}",
                "alternatives": ["consult clinical pharmacist"],
                "conservation_strategies": ["standard conservation protocols"],
                "confidence_score": 0.7
            }

app = FastAPI(title="TxAgent Assistant Wrapper", version="1.0.0")

# Configure CORS to match Supabase Edge Function
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["authorization", "x-client-info", "apikey", "content-type"],
)

# Initialize TxAgent
drug_agent = None

@app.on_event("startup")
async def startup_event():
    global drug_agent
    try:
        print("Initializing TxAgent Drug Shortage Agent...")
        drug_agent = DrugShortageAgent()
        print("TxAgent initialized successfully!")
    except Exception as e:
        print(f"Error initializing TxAgent: {e}")
        # Continue with basic agent for testing
        drug_agent = DrugShortageAgent()

# Request/Response Models matching OpenAI assistant interface
class Message(BaseModel):
    id: Optional[str] = None
    role: str  # "user" or "assistant"
    content: str
    timestamp: Optional[str] = None

class AssistantRequest(BaseModel):
    assistantType: str  # "shortage" or "document"
    messages: Optional[List[Message]] = []
    drugData: Optional[Dict[str, Any]] = None
    allShortageData: Optional[List[Dict[str, Any]]] = None
    documentContent: Optional[str] = None
    sessionId: Optional[str] = None
    threadId: Optional[str] = None
    generateDocument: bool = False

class AssistantResponse(BaseModel):
    threadId: str
    messages: List[Message]
    error: Optional[str] = None
    missingApiKey: bool = False

# In-memory conversation storage (in production, use Redis or database)
conversations: Dict[str, Dict] = {}

class TxAgentAssistant:
    def __init__(self):
        self.shortage_assistant_instructions = """
        You are a specialized biomedical AI assistant focused on drug shortage analysis. 
        You have access to comprehensive drug databases and clinical guidelines.
        
        When analyzing drug shortages, provide:
        1. Detailed shortage impact assessment
        2. Evidence-based therapeutic alternatives with dosing information
        3. Conservation strategies and supply management
        4. Patient prioritization criteria
        5. Clinical considerations and contraindications
        6. Implementation guidance for healthcare teams
        
        Always prioritize patient safety and evidence-based recommendations.
        """
        
        self.document_assistant_instructions = """
        You are a documentation specialist for healthcare communications.
        Create clear, professional documents for hospital staff regarding drug shortages.
        
        Focus on:
        1. Clear, actionable information
        2. Proper medical terminology
        3. Well-structured format with appropriate headings
        4. Practical implementation guidance
        5. Emergency contact information when relevant
        
        Generate documents in markdown format with clear sections.
        """

    async def analyze_shortage(self, drug_data: dict, all_shortage_data: list = None) -> str:
        """Analyze drug shortage using TxAgent"""
        try:
            if not drug_agent:
                return "TxAgent not available. Please check system configuration."
            
            drug_name = drug_data.get('brand_name') or drug_data.get('drug_name', 'Unknown Drug')
            
            # Use TxAgent to analyze the shortage
            analysis_result = await drug_agent.analyze_drug_shortage(
                drug_name=drug_name,
                shortage_data=drug_data
            )
            
            # Format the comprehensive response
            response = f"""# Drug Shortage Analysis: {drug_name}

## Shortage Overview
**Drug**: {drug_name}
**Status**: {drug_data.get('shortage_status', 'Under review')}
**Expected Resolution**: {drug_data.get('anticipated_resolution_date', 'TBD')}
**Reason**: {drug_data.get('reason_shortage', 'Not specified')}

## Impact Assessment
{analysis_result.get('analysis', 'Analyzing impact on patient care and treatment protocols...')}

## Therapeutic Alternatives
{self._format_alternatives(analysis_result.get('alternatives', []))}

## Conservation Strategies
{self._format_conservation_strategies(analysis_result.get('conservation_strategies', []))}

## Patient Prioritization
- **High Priority**: Patients with no suitable alternatives
- **Medium Priority**: Patients with limited alternatives
- **Lower Priority**: Patients with multiple therapeutic options

## Clinical Considerations
- Monitor patients closely when switching therapies
- Consider dosing adjustments for alternative medications
- Document all therapeutic changes in patient records
- Ensure appropriate patient counseling on new medications

## Implementation Plan
1. **Immediate Actions**: Inventory assessment and conservation measures
2. **Short-term**: Implement therapeutic alternatives
3. **Long-term**: Monitor resolution and plan for supply restoration

**Confidence Score**: {analysis_result.get('confidence_score', 0.8):.1%}

*Analysis generated by TxAgent Biomedical AI Assistant*
"""
            return response
            
        except Exception as e:
            logging.error(f"Error in TxAgent analysis: {e}")
            return f"Error analyzing shortage: {str(e)}"

    async def generate_document(self, drug_data: dict, document_content: str = None) -> str:
        """Generate or update shortage management document"""
        try:
            drug_name = drug_data.get('brand_name') or drug_data.get('drug_name', 'Unknown Drug')
            
            if document_content:
                # Update existing document
                prompt = f"""Update this existing document with new information:

{document_content}

New drug data: {json.dumps(drug_data, indent=2)}

Please revise the document to include any new information while maintaining the existing structure."""
                
                # For now, return enhanced document (would use TxAgent for actual updates)
                return f"""# Updated: Drug Shortage Management Plan - {drug_name}

{document_content}

## Latest Update
- **Updated**: {datetime.now().strftime('%Y-%m-%d %H:%M')}
- **Status**: {drug_data.get('shortage_status', 'Monitoring')}

*Document updated by TxAgent Assistant*
"""
            else:
                # Generate new document
                if drug_agent:
                    analysis_result = await drug_agent.analyze_drug_shortage(
                        drug_name=drug_name,
                        shortage_data=drug_data
                    )
                else:
                    analysis_result = {"analysis": "Basic shortage analysis", "alternatives": [], "conservation_strategies": []}
                
                return f"""# Drug Shortage Management Plan - {drug_name}

## Executive Summary
A shortage of {drug_name} has been identified. This document outlines the management strategy and therapeutic alternatives for healthcare staff.

## Product Details
- **Brand Name**: {drug_data.get('brand_name', 'N/A')}
- **Generic Name**: {drug_data.get('drug_name', 'N/A')}
- **DIN**: {drug_data.get('din', 'N/A')}
- **Manufacturer**: {drug_data.get('company_name', 'N/A')}

## Shortage Information
- **Shortage Status**: {drug_data.get('shortage_status', 'Under investigation')}
- **Expected Resolution**: {drug_data.get('anticipated_resolution_date', 'TBD')}
- **Reason for Shortage**: {drug_data.get('reason_shortage', 'Not specified')}

## Therapeutic Alternatives
{self._format_alternatives(analysis_result.get('alternatives', ['Consult clinical pharmacist for alternatives']))}

## Conservation Strategies
{self._format_conservation_strategies(analysis_result.get('conservation_strategies', ['Implement standard conservation protocols']))}

## Communication Strategy
- Notify all relevant departments immediately
- Update electronic health records with shortage alerts
- Provide staff education on alternatives
- Communicate with patients as needed

## Contact Information
- **Pharmacy Department**: [Extension]
- **Clinical Pharmacist**: [Contact]
- **Shortage Coordinator**: [Contact]

---
*Generated on {datetime.now().strftime('%Y-%m-%d at %H:%M')} by TxAgent Assistant*
"""
                
        except Exception as e:
            logging.error(f"Error generating document: {e}")
            return f"Error generating document: {str(e)}"

    def _format_alternatives(self, alternatives: list) -> str:
        """Format therapeutic alternatives section"""
        if not alternatives:
            return "- Consult with clinical pharmacist for appropriate alternatives"
        
        formatted = []
        for alt in alternatives:
            if isinstance(alt, str):
                formatted.append(f"- {alt}")
            else:
                formatted.append(f"- {str(alt)}")
        
        return "\n".join(formatted)

    def _format_conservation_strategies(self, strategies: list) -> str:
        """Format conservation strategies section"""
        if not strategies:
            return "- Implement standard conservation protocols\n- Review current inventory levels\n- Prioritize patients based on clinical need"
        
        formatted = []
        for strategy in strategies:
            if isinstance(strategy, str):
                formatted.append(f"- {strategy}")
            else:
                formatted.append(f"- {str(strategy)}")
        
        return "\n".join(formatted)

    async def handle_follow_up_question(self, question: str, drug_data: dict, conversation_history: list) -> str:
        """Handle a follow-up question based on the conversation history"""
        try:
            drug_name = drug_data.get('brand_name') or drug_data.get('drug_name', 'Unknown Drug')
            question_lower = question.lower()
            
            # Determine what the user is asking about and provide specific answers
            if any(keyword in question_lower for keyword in ['report id', 'report number', 'id number']):
                report_id = drug_data.get('report_id') or drug_data.get('id')
                return f"The report ID for the {drug_name} shortage is: **{report_id}**"
                
            elif any(keyword in question_lower for keyword in ['company', 'manufacturer', 'maker']):
                company = drug_data.get('company_name', 'Unknown Company')
                return f"The manufacturer of {drug_name} is: **{company}**"
                
            elif any(keyword in question_lower for keyword in ['date', 'when', 'start', 'end', 'timeline']):
                start_date = drug_data.get('actual_start_date') or drug_data.get('start_date')
                end_date = drug_data.get('estimated_end_date') or drug_data.get('end_date')
                
                response = f"**Timeline for {drug_name} shortage:**\n"
                if start_date:
                    response += f"- **Started**: {start_date}\n"
                if end_date:
                    response += f"- **Expected resolution**: {end_date}\n"
                else:
                    response += f"- **Expected resolution**: Not yet determined\n"
                return response
                
            elif any(keyword in question_lower for keyword in ['reason', 'why', 'cause', 'what happened']):
                reason = drug_data.get('reason_for_shortage', 'Reason not specified')
                return f"**Reason for {drug_name} shortage:** {reason}"
                
            elif any(keyword in question_lower for keyword in ['status', 'current', 'active', 'confirmed']):
                status = drug_data.get('status', 'Unknown status')
                return f"**Current status of {drug_name} shortage:** {status}"
                
            elif any(keyword in question_lower for keyword in ['dosage', 'form', 'strength', 'dose']):
                dosage_form = drug_data.get('dosage_form', 'Not specified')
                strength = drug_data.get('strength', 'Not specified')
                
                response = f"**Product details for {drug_name}:**\n"
                response += f"- **Dosage form**: {dosage_form}\n"
                if strength and strength.strip():
                    response += f"- **Strength**: {strength}\n"
                return response
                
            elif any(keyword in question_lower for keyword in ['alternative', 'substitute', 'replacement', 'other option']):
                # Get alternatives from TxAgent if available
                if drug_agent:
                    analysis_result = await drug_agent.analyze_drug_shortage(
                        drug_name=drug_name,
                        shortage_data=drug_data
                    )
                    alternatives = analysis_result.get('alternatives', [])
                    if alternatives:
                        return f"**Therapeutic alternatives for {drug_name}:**\n" + self._format_alternatives(alternatives)
                
                return f"**For therapeutic alternatives to {drug_name}:**\nPlease consult with your clinical pharmacist who can recommend appropriate substitutes based on patient-specific factors."
                
            elif any(keyword in question_lower for keyword in ['tier', 'priority', 'level']):
                tier_3 = drug_data.get('tier_3', False)
                tier_text = "Tier 3 (highest priority)" if tier_3 else "Lower tier priority"
                return f"**Priority level for {drug_name} shortage:** {tier_text}"
                
            else:
                # General question - provide comprehensive overview
                return f"""**Here's what I know about the {drug_name} shortage:**

📋 **Report ID**: {drug_data.get('report_id') or drug_data.get('id', 'Not available')}
🏢 **Manufacturer**: {drug_data.get('company_name', 'Unknown Company')}
📅 **Start Date**: {drug_data.get('actual_start_date', 'Not specified')}
🎯 **Expected Resolution**: {drug_data.get('estimated_end_date', 'TBD')}
⚠️ **Status**: {drug_data.get('status', 'Under review')}
💊 **Form**: {drug_data.get('dosage_form', 'Not specified')}
❓ **Reason**: {drug_data.get('reason_for_shortage', 'Not specified')}

*For specific questions, ask me about alternatives, timeline, company details, or other aspects of this shortage.*"""
                
        except Exception as e:
            logging.error(f"Error handling follow-up question: {e}")
            return f"I encountered an error processing your question about {drug_name}. Please try rephrasing your question or contact support."

# Initialize assistant
txagent_assistant = TxAgentAssistant()

@app.post("/openai-assistant", response_model=AssistantResponse)
async def openai_assistant_endpoint(request: AssistantRequest):
    """
    Main endpoint that matches the OpenAI assistant interface
    """
    logger.info(f"Received request for /openai-assistant. Type: {request.assistantType}")
    logger.info(f"Incoming messages: {request.messages}") # Log the received messages
    logger.info(f"Drug data: {request.drugData}")
    logger.info(f"Session ID: {request.sessionId}, Thread ID: {request.threadId}")

    try:
        # Generate or retrieve thread ID
        thread_id = request.threadId or str(uuid.uuid4())
        
        # Initialize conversation if new thread
        if thread_id not in conversations:
            conversations[thread_id] = {
                "messages": [],
                "assistant_type": request.assistantType,
                "session_id": request.sessionId,
                "created_at": datetime.now().isoformat()
            }
        
        # Get existing messages
        existing_messages = conversations[thread_id]["messages"]
        
        # Process based on assistant type
        if request.assistantType == "shortage":
            # Check if we have new user messages to respond to
            new_user_messages = [msg for msg in request.messages if msg.role == "user" and msg.content.strip()]
            
            if new_user_messages:
                # This is a follow-up question - process the conversation
                for msg in new_user_messages:
                    # Add user message to conversation
                    user_message = Message(
                        id=msg.id or str(uuid.uuid4()),
                        role="user",
                        content=msg.content,
                        timestamp=datetime.now().isoformat()
                    )
                    existing_messages.append(user_message.dict())
                    
                    # Generate contextual response based on the question and drug data
                    response_content = await txagent_assistant.handle_follow_up_question(
                        question=msg.content,
                        drug_data=request.drugData,
                        conversation_history=existing_messages
                    )
                    
                    assistant_message = Message(
                        id=str(uuid.uuid4()),
                        role="assistant", 
                        content=response_content,
                        timestamp=datetime.now().isoformat()
                    )
                    existing_messages.append(assistant_message.dict())
                
                conversations[thread_id]["messages"] = existing_messages
                
            elif request.drugData and len(existing_messages) == 0:
                # This is the initial shortage analysis (no previous messages)
                analysis = await txagent_assistant.analyze_shortage(
                    drug_data=request.drugData,
                    all_shortage_data=request.allShortageData
                )
                
                # Create assistant message
                assistant_message = Message(
                    id=str(uuid.uuid4()),
                    role="assistant",
                    content=analysis,
                    timestamp=datetime.now().isoformat()
                )
                
                # Add to conversation
                existing_messages.append(assistant_message.dict())
                conversations[thread_id]["messages"] = existing_messages
            
            # If no new messages and conversation exists, just return existing conversation

        elif request.assistantType == "document":
            # Document generation assistant
            if request.generateDocument and request.drugData:
                document = await txagent_assistant.generate_document(
                    drug_data=request.drugData,
                    document_content=request.documentContent
                )
                
                assistant_message = Message(
                    id=str(uuid.uuid4()),
                    role="assistant",
                    content=document,
                    timestamp=datetime.now().isoformat()
                )
                
                existing_messages.append(assistant_message.dict())
                conversations[thread_id]["messages"] = existing_messages
            
            else:
                # Handle document editing requests
                for msg in request.messages:
                    if msg.role == "user":
                        user_message = Message(
                            id=msg.id or str(uuid.uuid4()),
                            role="user",
                            content=msg.content,
                            timestamp=datetime.now().isoformat()
                        )
                        existing_messages.append(user_message.dict())
                        
                        # Generate document update
                        updated_document = await txagent_assistant.generate_document(
                            drug_data=request.drugData or {},
                            document_content=request.documentContent
                        )
                        
                        assistant_message = Message(
                            id=str(uuid.uuid4()),
                            role="assistant",
                            content=updated_document,
                            timestamp=datetime.now().isoformat()
                        )
                        existing_messages.append(assistant_message.dict())
                
                conversations[thread_id]["messages"] = existing_messages

        # Convert stored messages back to Message objects
        response_messages = [
            Message(
                id=msg["id"],
                role=msg["role"],
                content=msg["content"],
                timestamp=msg["timestamp"]
            ) for msg in existing_messages
        ]
        
        return AssistantResponse(
            threadId=thread_id,
            messages=response_messages
        )
        
    except Exception as e:
        logging.error(f"Error in assistant endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "TxAgent Assistant Wrapper",
        "txagent_loaded": drug_agent is not None,
        "active_conversations": len(conversations)
    }

@app.get("/conversations/{thread_id}")
async def get_conversation(thread_id: str):
    """Get conversation by thread ID"""
    if thread_id in conversations:
        return conversations[thread_id]
    else:
        raise HTTPException(status_code=404, detail="Conversation not found")

@app.delete("/conversations/{thread_id}")
async def delete_conversation(thread_id: str):
    """Delete conversation by thread ID"""
    if thread_id in conversations:
        del conversations[thread_id]
        return {"message": "Conversation deleted"}
    else:
        raise HTTPException(status_code=404, detail="Conversation not found")

if __name__ == "__main__":
    import uvicorn
    print("Starting TxAgent Assistant Wrapper...")
    print("This service provides OpenAI-compatible interface using TxAgent biomedical AI")
    uvicorn.run(app, host="0.0.0.0", port=8001) 