# 🚀 Mingo

**AI Powered Meeting Management System**

Mingo is an AI-based meeting management system designed to improve meeting quality, efficiency, and continuity inside organizations.
The system analyzes recorded meetings and transforms conversations into structured outputs such as summaries, decisions and action items.

---

# 👥 Team

| Name | ID | Email |
|-----|-----|-----|
| Liron Dabach | 322439027 | liron.dabach3@gmail.com |
| Sean Nedorez | 213141146 | shonedo25@gmail.com |
| Shiran Levi | 324127315 | theshirkan@gmail.com |
| Tal Gohar | 212628796 | talgohar2@gmail.com |

👩‍🏫 **Supervisor:**  
Natali Fridman

---

# 📌 Main Features

✅ Secure authentication  
✅ Meeting creation and management  
✅ Upload recorded meetings (MP3)  
✅ Automatic transcription  
✅ AI-generated summaries  
✅ AI meeting assistant  
✅ Automatic task extraction and tracking through the GitHub API  
✅ Meeting history and follow-ups  

---

# 🏗 System Architecture

The system is composed of four main components:

**Frontend**  
User interface for meetings, summaries, tasks and AI assistant.

**Backend**  
Handles API logic, meeting workflows and AI processing.

**Database**  
MongoDB storing meetings, transcripts, summaries and tasks.

**External Services**  
LLM services, speech-to-text services, email integrations, and GitHub API for task creation and tracking via repository issues.

---

# 🛠 Technologies

**Frontend**
- React

**Backend**
- Node.js
- Express.js

**Database**
- MongoDB

**AI**
- Speech-to-Text (Whisper / Deepgram)
- LLM for meeting analysis and assistant

---

# 🎬 Example Workflow

1️⃣ User uploads a recorded meeting (MP3)  
2️⃣ The system transcribes the audio  
3️⃣ AI analyzes the transcript  
4️⃣ Mingo generates:  
- Meeting summary  
- Key topics  
- Action items