# Project Context: AI Final CGPA Determination & Prediction Engine

## 1. Overview & Objective

This document summarizes the AI module implemented for the **StudyGrid** (Academic Radar) platform.

The goal of this module is to **determine and predict a student's final CGPA** using a university-standard three-component academic grading distribution:
1. **Attendance Marks** ($\approx 10\%$ weight)
2. **Class Test (CT) Marks** ($\approx 20\%$ weight)
3. **Term Final Exam Marks** ($\approx 70\%$ weight)

Students can view their published ongoing marks, manually enter or upload term marks, simulate "what-if" exam outcomes with interactive sliders, calculate their exact Semester GPA and Cumulative Final CGPA, and receive personalized strategic advice from an AI Academic Advisor.

---

## 2. Academic Grading & Calculation Logic

### A. Course Maximum Marks Allocation
Based on course credit hours ($C$):
* **Theory Courses (e.g., $C = 3$ credits $\rightarrow 300$ total marks):**
  * $\text{Attendance Max} = 10 \times C$ ($30$ marks)
  * $\text{CT Max} = 20 \times C$ ($60$ marks)
  * $\text{Term Final Max} = 70 \times C$ ($210$ marks)
  * $\text{Course Total Max} = 100 \times C$ ($300$ marks)
* **Lab Courses (e.g., $C = 1.5$ credits $\rightarrow 150$ total marks):**
  * $\text{Attendance Max} = 10 \times C$ ($15$ marks)
  * $\text{Continuous Assessment / Reports Max} = 30 \times C$ ($45$ marks)
  * $\text{Lab Final / Viva Max} = 60 \times C$ ($90$ marks)
  * $\text{Course Total Max} = 100 \times C$ ($150$ marks)

### B. Course Grade Points
$$\text{Course Percentage} = \left(\frac{\text{Attendance} + \text{CT} + \text{Term Final}}{\text{Total Max Marks}}\right) \times 100\%$$

| Percentage | Letter Grade | Grade Point | Remarks |
| :--- | :---: | :---: | :--- |
| $\ge 80\%$ | **A+** | **4.00** | Outstanding |
| $75\% \text{ to } <80\%$ | **A** | **3.75** | Excellent |
| $70\% \text{ to } <75\%$ | **A-** | **3.50** | Very Good |
| $65\% \text{ to } <70\%$ | **B+** | **3.25** | Good |
| $60\% \text{ to } <65\%$ | **B** | **3.00** | Satisfactory |
| $55\% \text{ to } <60\%$ | **B-** | **2.75** | Above Average |
| $50\% \text{ to } <55\%$ | **C+** | **2.50** | Average |
| $45\% \text{ to } <50\%$ | **C** | **2.25** | Below Average |
| $40\% \text{ to } <45\%$ | **D** | **2.00** | Pass |
| $< 40\%$ | **F** | **0.00** | Fail |

### C. Semester GPA & Final Cumulative CGPA
* **Semester GPA:**
  $$\text{Semester GPA} = \frac{\sum (\text{Course Grade Point} \times \text{Course Credits})}{\sum \text{Course Credits}}$$
* **Cumulative Final CGPA:**
  $$\text{Final CGPA} = \frac{\sum_{\text{past}} \text{Semester CGPA} + \text{Current Semester GPA}}{\text{Total Semesters Count}}$$

---

## 3. AI Architecture (100% Free & Resilient)

The AI engine in `backend/src/services/ai.service.js` uses a **multi-tiered architecture** with zero paid cloud requirements:

1. **Tier 1 — Local Free AI (Ollama):**
   * Connects to local Ollama daemon at `http://localhost:11434/api/generate`.
   * Supports models like `llama3`, `mistral`, `gemma2`, `phi3` configured via `OLLAMA_MODEL` in `.env`.
   * 100% private, runs locally, no API key or subscription needed.
2. **Tier 2 — Free Cloud AI (Google Gemini API):**
   * If `GEMINI_API_KEY` is provided in `.env`, connects to `gemini-1.5-flash` via Google AI Studio's free tier.
3. **Tier 3 — Built-in Intelligent Offline Academic AI Engine:**
   * If neither Ollama nor an external API key is active, this deterministic heuristic engine automatically runs.
   * Analyzes the 3 components, computes sensitivity gaps, detects at-risk courses, and generates actionable recommendations without external network requests.
   * **Result:** The system never crashes or errors out.

---

## 4. Features Implemented in the Dedicated Student Tab (`/student/ai-cgpa`)

* **Live 3-Component Matrix:**
  * Displays every enrolled course for the semester.
  * Inputs for **Attendance Mark**, **CT Mark**, and **Term Final Mark** (with an interactive range slider).
  * Real-time calculation of total marks, percentages, and grade pill badges as the student types or moves sliders.
* **Component Contribution Meter:**
  * Visual progress bars showing percentage score in Attendance vs CT vs Term Final.
* **Smart Actions:**
  * `⚡ Determine Final CGPA with AI`: Computes final GPA/CGPA and generates AI diagnosis.
  * `🎯 Auto-Forecast Term Marks`: AI estimates likely final exam performance based on existing CT and attendance consistency.
  * `🎯 Optimize for Target CGPA`: Solves the inverse problem (goal-seek) to find the minimum term marks needed to hit a target CGPA.
  * `💾 Save Marks to Database`: Persists the entered 3-part marks into MongoDB.
  * `📝 Save GPA to Semester History`: Commits the determined semester GPA into official records.
* **AI Academic Advisor Card:**
  * Displays executive verdict, component impact diagnosis (which component helped/hurt the grade most), course highlights, and bulleted study priorities.

---

## 5. File Changes & Additions

### Backend (`/backend`)
* `src/models/term-mark.model.js` *(NEW)*: Mongoose schema for `term_marks` collection storing attendance, CT, and term marks per student/course/semester.
* `src/services/ai.service.js` *(NEW)*: Core grading mathematics, Ollama client, Gemini client, and local heuristic engine.
* `src/controllers/portal.controller.js` *(MODIFIED)*:
  * `getStudentAiCgpaContext`: Aggregates active courses, recorded attendance, CT marks, past CGPA history, and target CGPA.
  * `saveStudentTermMarks`: Upserts manually entered/uploaded marks to `term_marks`.
  * `evaluateStudentAiCgpa`: Evaluates courses with AI service.
* `src/routes/portal.routes.js` *(MODIFIED)*: Exposes the 3 new endpoints under `/api/portal/student/`.
* `scripts/verify-ai-cgpa.js` *(NEW)*: Automated test script verifying marks formulas, CGPA calculations, and AI responses.
* `scripts/refine-db-from-frontend.js` *(MODIFIED)*: Registers `TermMark` model to sync indexes on startup.
* `.env.example` *(MODIFIED)*: Documents `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and `GEMINI_API_KEY`.

### Frontend (`/frontend`)
* `src/pages/AiCgpaPredictorPage.jsx` *(NEW)*: Interactive React page for 3-component marks determination, sliders, goal-seek, and AI insights.
* `src/lib/constants.js` *(MODIFIED)*: Added `["AI CGPA Predictor", "/student/ai-cgpa"]` to `NAV_ITEMS.student`.
* `src/App.jsx` *(MODIFIED)*: Registered route `/student/ai-cgpa` and legacy redirect `/student-ai-cgpa.html`.
* `src/pages/SharedPages.jsx` *(MODIFIED)*: Added Quick Action card to the Student Dashboard.
* `src/styles.css` *(MODIFIED)*: Added styling for stat cards, sliders, grade pills, component meters, and AI advisor report cards.

---

## 6. How to Run & Verify

### Step 1: Run the Backend
```powershell
cd backend
npm run dev
```

### Step 2: Run Verification Test
```powershell
cd backend
node scripts/verify-ai-cgpa.js
```

### Step 3: Run the Frontend
```powershell
cd frontend
npm run dev
```
Open `http://localhost:5173`, log in as a student, and click **AI CGPA Predictor** in the navigation bar.
