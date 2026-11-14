# CampusPilot changelog

A Chrome extension that makes Canvas friendlier and turns your course material into practice. It reads your own Canvas data (courses, lectures, files, grades and deadlines). It works with **any AI you already use** by copy and paste, so there's no API key, no account and nothing to pay for.

## New in 6.5: sorted for you, ready before you are
- **Priority and Additional.** Each course's Lectures list now splits into **Priority** (the core lectures, what exams test) and **Additional** (extra readings, bonus slides, optional material), next to Practice exams, Homework and Other. Priority shows by default; tap Additional to see the rest. An item's "⋯" (or a section's) lets you move it, and your choice always wins.
- **Sorted by reading, not just by title.** Titles sort most items for free. With Gemini, the ones a title can't place are sorted by Gemma, Google's small model with plenty of free requests: first from their titles and section names, then, if still unclear, from the first page of their text. Canvas pages that are only links or logistics go to Other; written pages you're meant to study become lectures you can set up like slides.
- **Study sets that make themselves.** Home offers, once, to make the study sets for all your Priority lectures in the background, most urgent first (the nearest exam, then the newest lectures). It uses only Gemini's careful models and stops for the day when they're used up, so every set is made the best way; the rest continue tomorrow. Home shows how far along it is. Open a lecture that's still being made and it says what's happening ("Round 2 of 5 is being written now") and lets you start the rounds already done. Turn it on or off in Settings › Your AI. Additional material is made only when you pick it (a course's ⋯ › Set up lectures…, now with **Priority only** and **Additional only** buttons, or tick them all).
- **Report a problem** from inside CampusPilot (Settings › Help & feedback, or **Report** on any error message). Say what happened, attach a screenshot if you like, and leave **Include technical details** on to help it get fixed faster. **See exactly what's sent** shows the whole report first: no grades, files, keys or passwords, and course names and numbers on screen are hidden.
- **"Your courses also use…"**: when your courses link to tools CampusPilot can't connect to yet (Piazza, zyBooks, Ed Discussion and others), Home asks whether to tell the developer. Only the tools' names are sent.
- The website moved to **campuspilot.clabianco.fyi** (the old address forwards there).
- The privacy policy explains reports and suggestions: what's in them, where they go, and that they're deleted after 180 days.

## New in 6.4: better questions, files that are always there
- **Study now** on Home: one button for "I have 10 minutes". Questions due for review come first, then the next round of the lecture you're learning.
- **Your lecture files are kept.** Every lecture file CampusPilot reads (PDFs, slides, documents, pictures; never videos or audio) is saved on your computer. If you sign in to sync, it's also backed up to CampusPilot's private folder in your Google Drive, so your other computers have it too. Slides open and Gemini can read a lecture even when Canvas won't hand the file over again ("Couldn't load the file (Failed to fetch)" is gone). Settings › Advanced shows what's saved on this computer and in Drive, each with a Clear button. Drive backups are capped at 100 MB per file and 2 GB in total, since they count toward your Drive storage.
- **Written answers are read for you** (Gemini inside CampusPilot): after you type an explanation, Gemini ticks the key points your answer covers. You can change any tick before pressing Done.
- **Questions fit the subject.** Math, stats, physics and engineering lean on worked problems with fresh numbers. Computing asks what code does and where the bug is. Biology asks about processes in order and cause and effect. History, politics and philosophy ask about arguments and evidence. Languages ask you to apply the rule to new words.
- **Fresh questions before they run out.** When you've seen every question for an item you haven't learned yet, Gemini writes new ones for it in different words and formats, so practice never turns into remembering answers.
- **Answer keys are checked against the slides.** A second model re-solves each new question using the lecture's own text, and any question whose marked answer looks wrong is removed. Calculation questions are also re-run in code, so a question whose numbers don't work out never reaches you.
- **Long lectures are read in pieces.** A lecture over 35 slides is read 25 slides at a time, then combined, so nothing near the end gets skipped.
- **Gemini's free requests go further.** Careful jobs (checklists, questions) use the Flash models, quick jobs use Flash-Lite, and small jobs (sorting, checking, reading class times) use Gemma, which has thousands of free requests a day. Replies come back as structured data, so fewer go wrong. A model that hits its per-minute limit is passed over for a minute instead of waiting.
- **Most urgent first.** "For your AI" runs lectures in the order you need them: what your study plan has you learning soonest, or the course with the nearest exam.
- **Less guesswork.** When CampusPilot can't tell from a title whether something is a lecture, Gemini sorts it (from the titles and section names only). Work turned in on Gradescope under a different name than on Canvas is matched by Gemini too (from the assignment names and dates only).
- Lecture files are uploaded to Gemini once and reused for two days, instead of once per request.
- The privacy policy covers the saved files, the Drive backup, and what Gemma is sent.

## New in 6.3: keeps going, checks its answers
- **Keeps working when you close CampusPilot.** If you close the panel while Gemini is setting up lectures, a small pinned tab carries on ("CampusPilot is finishing your list"), showing the step it's on in its title, and closes itself when the list is done. Opening CampusPilot takes the work back. **Stop and close** in that tab stops it.
- **One failed step no longer holds up the list.** If Gemini is busy or you're briefly offline, that step moves to the end of the list (to try once more) and the next one starts. If the day's free requests run out, the list pauses and keeps its place under Home › For your AI, ready to start again after midnight Pacific time.
- **Answer keys are double-checked.** After each round of questions from Gemini, a second request solves the questions independently. Any question whose marked answer looks wrong, or that has more than one right answer, is removed, and its items are marked as still needing questions.
- **The study plan knows exactly which lectures an assignment needs.** Your AI now names lectures by short codes (L1, L2…) instead of titles, so "learn first" links the right lecture even when titles differ ("Lec 5" vs "Week 3 slides.pdf").
- The privacy policy says plainly that setting up Gemini needs you to be 18 or older (Google's rule), and that younger students can use their own AI's website.
- New store screenshots.

## New in 6.2: one click sets up a lecture
- **6.2.1:** **Set up lectures…** (in a course's "⋯" menu, next to the kind buttons) opens a short list by section, the same sections as the Lectures tab, with checkboxes: tick **All lectures**, a whole section, or single lectures, then **Set up N lectures**. Lectures already set up show as done. Each section's own "⋯" has **Set up this section's lectures…**, which opens the same list with just that section ticked. Works with Gemini (one lecture after another, by itself) and with your own AI's website (each goes in your list; you press Send).
- **6.2.1:** a section's "⋯" menu no longer shows its choices in capital letters.
- **Set up this lecture is one click** when Gemini runs inside CampusPilot. Gemini reads the lecture and makes the checklist and flashcard terms, then writes every round of questions, one after another. The bar at the bottom shows each step ("Step 2 of 4 · Lecture 7: Part 2") with a clock. You can start Learn as soon as round 1 is done. With your own AI's website, it works as before: one request at a time, and you press Send.
- **Set up many lectures:** a course's "⋯" menu (next to the kind buttons) sets up several lectures one after another, so each one is ready to study as soon as its turn is done. **Stop the list after this one** stops it any time.

## New in 6.1: free AI, right inside CampusPilot
- **6.1.5:** Gemini answers start sooner: CampusPilot asks Gemini to think briefly before writing (its requests already spell out exactly what to do), instead of Gemini's long default. The progress bar now shows a clock and says what's happening: "Gemini 3.8 Flash is busy. Trying again (2 of 3)…", "…using Gemini 3.6 Flash instead", or that a whole lecture can take a few minutes.
- **6.1.4:** **Today is now called Home.**
- **6.1.4:** connecting Gradescope takes turned-in work off your list right away again. Allowing it (from Home, Settings or a course's Files), or ticking a course for Gradescope or Jupyter in Settings, now refreshes Canvas and checks Gradescope at once, following each course's Gradescope link in Canvas so courses with different names are found too. Before, past-due work stayed on the list until a later check.
- **6.1.4:** "Gradescope found" is at the top of Home, where it's seen.
- **6.1.4:** Gemini setup says up front that it needs a personal Google account (like Gmail), since school Google accounts don't work; the button reads "Sign in with a personal Google account". The error sheet no longer shows "Get a key on Google's page" twice.
- **6.1.3:** Gemini setup no longer says "Use a Google account not associated with your institution" for every problem. It said that whenever Google answered with an error at all, so the real reason was hidden. It now says that only when an account really is blocked by its school or work administrator. Other problems get their own plain message, and **What Google said** shows Google's exact words (with a Copy button). When the problem is on CampusPilot's side, the sheet offers Google's key page instead.
- **6.1.2:** each module in a course's list has its own "⋯" with **Everything in this module is…**: Lectures, Practice exams, Homework or Other. It moves the whole module (a "Sections" folder of discussion files, say) to that list in one go; a single item's own choice still wins, and **Let CampusPilot decide again** undoes it.
- **6.1.2:** messages always show on top: one that appeared behind an open sheet (like "Mark some study time on My week first" behind the study plan) is now in front of it. When the study plan can't be made, its sheet closes and the message offers **Open My week**.
- **6.1.2:** the "⋯" menu next to a course's kind buttons is no longer cut off by its box, and the kind buttons don't break their text across lines.
- **6.1.1:** Gemini's free requests go much further. Lecture checklists and study plans (what everything else builds on) use the newest Gemini Flash; everything else (rounds of questions, flashcard terms, chats, class times, grade weights) uses the newest Flash-Lite, which has many more free requests a day (about 500, against about 20 per Flash model). Models are chosen by name, newest first: one whose day is used up is skipped until midnight Pacific time (when Google's free day starts over), one with no free requests is skipped for good, and a per-minute limit is waited out. Settings › Your AI shows today's count of careful and quick requests.
- **Set up your free AI, once.** The first time you use an AI feature, one sheet opens. **Sign in with Google** and CampusPilot makes your own free Gemini key in your Google account: a free "CampusPilot" project (no billing, no card), the Gemini API turned on, and a key named "campuspilot" that only works for Gemini, saved on this computer only. Before you sign in, it shows exactly what it will do, what Google's permission screen will ask, and what it means for your data. The Google Cloud access is handed back as soon as the key is made. If you set it up before, it reuses that project.
- **Then everything happens here.** Checklists, questions, flashcard terms, class times, grade weights and study plans come straight back into CampusPilot, with a progress bar: no tabs, no Send button, no copying. "For your AI" runs the whole list by itself. Study guides and "Ask about this lecture" open as a short chat in the panel, with follow-up questions.
- **Pick your Google account.** Google's own window lets you choose an account, so a Chrome profile signed in to a school account isn't a problem. If an account is blocked by its school or work administrator, CampusPilot says so plainly: use a Google account not associated with your institution.
- **Other ways, always there:** get a key on Google's page yourself (CampusPilot picks the copied key up by itself, no pasting), or use your own AI's website (ChatGPT, Claude, Gemini, Copilot) exactly as before.
- **When Gemini can't answer** (free daily limit used up, offline, Google busy), CampusPilot says why and offers **Website**: the same request through Gemini's website, the usual way. When Flash's free limit runs out it tries Flash-Lite first. A request that was running when you closed the panel starts again when you open it.
- **Chrome's built-in AI, on computers that can run it:** if you use your own AI's website, **Quick tasks on this computer** lets Chrome's built-in AI do small jobs (reading class times or grade weights from text) right here, offline. Bigger jobs still go to your AI.
- **Settings › Your AI** shows whether Gemini is set up, which model it uses, a link to your project in Google Cloud, and **Remove the key**.
- The privacy policy explains the new Google Cloud permission, where the key is kept, and that on Gemini's free tier Google may use what you send to improve its products.

## New in 6.0: simpler everywhere
- **6.0.2:** the tour covers all of CampusPilot, in short parts you can skip one at a time: Today and the focus timer; My week, the study plan and your plan on Canvas's calendar; Courses (export and edit, what a course lists, each lecture's menu, study sets, a sample quiz, videos and speed, Grades and the What-If calculator, Files); Study and Mixed test; how your AI helps; what CampusPilot adds to Canvas; search, "?" and Settings search. A bar shows how far along you are.
- **6.0.2:** the tour's highlight no longer trails behind: it waits for the page to finish drawing before it appears, then stays on what it points at while the page scrolls, resizes or redraws.
- **6.0.1:** **Search settings**: a search box at the top of Settings finds any switch, button or heading and takes you to it (the group opens and the setting is outlined). It knows other names too: "dark mode", "pomodoro", "delete".
- **6.0.1:** the magnifier now finds features and settings by name as well as course material, and opens with a **Go to** list of everything in CampusPilot (My week, Study plan, Focus timer, What-If calculator, Mixed test, Export courses and the rest).
- **6.0.1:** the focus (Pomodoro) timer is back in the top bar on every tab, as well as on Today.
- **6.0.1:** Canvas calendar, month view: each planned sitting is its own line in its day with its start time (up to three, then "+2 more"), instead of one summary line. If CampusPilot can't line up with the view you're on, **Your plan** says so.
- **6.0.1:** the "activeTab" permission is kept after all: it lets CampusPilot read your AI's reply when you open CampusPilot on the chat's tab without having allowed that site.
- **A lecture is a study set.** Open a lecture and you get one progress bar ("7 of 12 learned") and three buttons: **Learn** (short rounds of questions; missed ones come back), **Flashcards**, and **Test**. Before that there's one button, **Set up this lecture**. The rest (study guide, ask about the lecture, a new test from your AI, download the slides, every round, rebuild) is under **More**. Wording is plainer too: "learned" and "still learning" instead of mastery levels, "rounds" instead of parts.
- **Choose what a course's list shows.** Chips above the list (Lectures, Practice exams, Homework, Other) turn each kind on or off per course; it starts with lectures and practice exams, so syllabi and handouts you'd never quiz yourself on are out of the way. Something filed wrong? Its "⋯" menu has **This is…** to move it. Each row is now just the title and its progress; Open in Canvas and the rest are in the row's "⋯".
- **Three course tabs:** Lectures, Grades, Files. The Overview tab is gone (its exams are under the lectures).
- **Video speed is where the videos are:** the lecture recordings card has the speed slider on it.
- **Study is four things:** Continue (your current lecture, one button), Review (what's due, and the questions you missed), Your lectures, and Mixed test (one test from several lectures; an exam's "Quiz me" lands here). Removed: the study-time bar chart, weak spots, progress per course, recent sessions and "Explain this page". "Export my study data for an AI" moved to Settings › Advanced.
- **Today is shorter:** one summary line instead of three tiles, Next up above the plan, the focus timer next to the greeting, and refresh at the bottom. The top bar is just "?" and search.
- **Settings in five groups:** Account & sync, Your AI, Appearance, Connections, Advanced.
- **The tour covers it all:** the kind chips, a lecture as a study set, how questions work (with the sample quiz), Study, and video speed.
- **The study plan teaches before it tests.** When an assignment uses a lecture you haven't finished learning, that lecture's Learn time is planned before the assignment's work, even if you didn't pick the lecture (a lecture that isn't set up yet gets a "Learn" sitting too). The assignment keeps its full estimated time after that, and is planned to be finished the day before it's due; study time on the due day is only a fallback.
- **Your plan on the Canvas calendar, in every view.** Month view (the one Canvas opens on) now shows a line on each day with what's planned and for how long; click it for that day's list. A **Your plan** button in the corner lists the next seven days in any view, agenda included. Week and day views keep the time blocks. Nothing is written to Canvas.
- **A cleaner Canvas calendar:** today stands out, weekends are lightly shaded, event titles wrap to two lines instead of being cut off, and days outside the month are dimmer. It's a switch in **Your plan** ("Cleaner calendar look"), next to "Show it on the calendar".

## New in 5.22: the tour shows how quizzes work
- **5.22.1:** Jupyter lecture notebooks no longer go missing from Lectures because of a word elsewhere in their path. A folder's own name now decides whether it's lecture material or homework ("lectures/lec05-exam-review" and "course-labs/lectures" are lectures); before, "lab", "exam", "project" or "final" anywhere in the path, even in the top folder's name, filed every notebook under homework.
- **5.22.0:** three new tour steps on Study: what it looks like before you've practiced (where to start), what it looks like once you have reviews and quizzes, and how a quiz works, with **Try a sample quiz**: three questions in the real quiz screen (multiple choice, true/false, and a short answer you grade yourself), then the results. Nothing in the sample is saved, and the tour carries on when you close it.

## New in 5.21: a first-run tour, and class times from more places
- **5.21.2:** the tour is up to date: Study mentions picking up your lecture (or starting the next), Appearance names all seven themes and that they restyle Canvas too, Accessibility is its own section, and the search/timer/refresh step highlights just those three buttons.
- **5.21.1:** "Which AI do you use?" is no longer a setup screen. Setting up only needs Canvas; the tour then runs without anything in its way. CampusPilot asks which AI you use the first time you use an AI feature (making questions, a study plan, Ask my AI), in a small sheet, and carries on with what you asked for once you pick. Until then, buttons say "your AI".
- **5.21.0:** a short click-through tour the first time you use CampusPilot (after Canvas is connected): Today, My week, Courses, Study, search and the timer, the "?" button, and Settings (Appearance, Your AI, Connections). Skip it any time; see it again from the "Show the tour" link at the bottom of Settings.
- **5.21.0:** My week › **Import class schedule**: the calendar file (.ics) of your class schedule from your school's registration site adds every lecture, section and lab at once, matched to your Canvas courses by course code ("PSTAT 100 DIS 0102" goes to PSTAT 100). Classes that aren't in your Canvas courses are listed and skipped.
- **5.21.0:** class meetings on the Canvas calendar that repeat every week (a lab every Tuesday 2-3:50pm, say) are suggested on My week under **On your Canvas calendar**: **Add** puts it on your week as yours, **Not mine** hides it for good. Nothing is added without your click.

## New in 5.20: connections turn themselves on
- **5.20.2:** My week reads your section straight from your Canvas course groups. Many schools put each section in a group named with everything about it, like "48210 [Jordan Lee] R 10:00AM ILP 4207": that becomes your section on Thursdays 10:00-10:50am in ILP 4207 with Jordan Lee, picked as yours, without asking your AI or confirming anything. It runs when My week opens (once a day) and every time class times are found. If the syllabus lists the same section, that one is picked instead of adding a copy.
- **5.20.2:** Jupyter notebooks are also found from a course menu tab named "Notebook" and from a short "To sync content" link (tinyurl and similar).
- **5.20.1:** Jupyter notebooks are found in many more places: a "JupyterHub" or "DataHub" tab in the course's Canvas menu (often next to Gradescope or Grades), module items, the syllabus, the front page, the course's pages and announcements, as well as assignments. A sync ("git-pull") link or any link to the hub counts, and so does a plain mention of JupyterHub. Every course is looked at again after this update.
- **5.20.1:** when the only JupyterHub link is a Canvas menu tab, the course's Files page offers **Connect through Canvas**: CampusPilot opens that link once to learn the hub's address, so you don't have to type it.
- **5.20.0:** Gradescope and Jupyter notebooks turn on by themselves for each course that uses them, and stay off for courses that don't. CampusPilot looks at each course when it first appears and then once a week: Gradescope in the course's Canvas menu, modules or assignments; Jupyter links in its modules and assignment pages. Settings › Connections shows which courses each one is on for (marked "found"); tick or untick any course and that choice stays. **Look again** checks every course right away.
- **5.20.0:** if Gradescope is found but CampusPilot can't read gradescope.com yet, Today asks once: **Allow** (one click), or **Not now**.
- **5.20.0:** opening a "⋯" menu no longer makes the page jump when the lecture list redraws.

## New in 5.19: StudyPilot is now CampusPilot
- **5.19.2:** Gradescope due dates (written like "2026-11-07 23:59:00 -0800") are read the same way in every browser, so matching by due time always works. Tested against a real Gradescope course page.
- **5.19.1:** work you turned in on Gradescope comes off Today, including before it's due. Before, CampusPilot only checked work that was already past due and marked as a Gradescope assignment in Canvas, every few hours. Now, with Gradescope on, it checks every assignment in that course that isn't turned in: every 15 minutes, each time you open Today, and right after you submit. Assignments match by name ("HW3" = "Homework 3: Sets") or by due time with a shared number or word ("Week 7 problems" = "Problem Set 7"), never "HW 3" with "HW 30". It reads Gradescope without opening a tab when it can.
- **5.19.1:** Settings › Connections › Gradescope has a **Turned-in check**: when it last checked, how many items each course has turned in on Gradescope, anything it couldn't match, and the reason when it can't check (log in to Gradescope, course not found). **Check now** checks right away, and follows a course's Gradescope link in Canvas if its Gradescope course wasn't found by name.
- **5.19.0:** StudyPilot is now called **CampusPilot**. Nothing moves: your courses, questions, progress, plan and Google Drive sync stay as they are. Requests to your AI now use `campuspilot-…` blocks; replies with the old `studypilot-…` blocks still work. New downloads go to Downloads › CampusPilot.
- **5.19.0:** the grade calculator is now the **What-If calculator**. Canvas's own grade and Reload from Canvas sit right under your current grade, with why the two can differ behind the "?".
- **5.19.0:** Today has one **Today** card: your classes and your study plan's sittings in time order, instead of two separate cards. The "You have N things due" line is gone (the tiles say it), and Next up gives assignment names the full width with the due date underneath.
- **5.19.0:** while your AI is answering, the bar at the bottom is one slim line (what it's doing, Paste, ×) instead of a quarter of the panel, and the "Copied" message is one short sentence. The AI list card no longer shows twice or says "0 requests" while a request is running.
- **5.19.0:** Lectures: the filter and a single "⋯" menu (Mark as seen, Arrange modules, Lecture settings) share one row. "Practice the whole module" is a small icon that shows on hover until you've practiced the module.
- **5.19.0:** video speed is one slider with its value and Reset (arrow keys still nudge it). Accessibility has its own group in Settings. Courses › Edit calls its second column "Prepare".
- **5.19.0:** smaller things: the study plan sheet folds each course to one line with what's picked; where an exam date came from, Export courses' "What's in it", and the plan sheet's explanation only show with the "?" on; locked assessments show a lock; Rebuild checklist moved into the checklist; Study › Keep learning suggests the next lecture to start.

## New in 5.18: optional connections
- **5.18.4:** the grade calculator was redesigned for the panel. Your grade comes first (current grade, what you need on what's left, worst and best case, "if I score"), then your assignments and weights, then saved results. The separate final-exam helper is gone from the panel: give the final a weight and no score, and "Needed on what's left" shows what you need on it. It uses the panel's own colors and font in every theme. The formulas and tips ("How it's calculated", the working under each result) only show with the "?" on.
- **5.18.3:** past-due Gradescope work no longer asks "Turned in on Gradescope?". With Gradescope on, CampusPilot checks Gradescope itself: right after you submit (it reads the page you land on), when you open the panel, and every 30 minutes while something is past due. Work Gradescope lists with nothing turned in says **Not turned in**; work turned in drops off the list.
- **5.18.3:** when CampusPilot updates (or is reloaded) while the side panel is open, the panel reloads into the new version. Before, the old panel stayed up half-working: buttons like Open My week did nothing and the grade calculator showed a broken page.
- **5.18.3:** the study plan sheet notices study time you mark on My week right away, without reopening it.
- **5.18.2:** the study plan no longer leaves a short leftover piece of a task when skipping a break fits it all in one sitting; course quiz rows keep their dropdown beside the course name; "Finish N missing items" sits on its own line under a lecture's progress; refreshed store and website screenshots.
- **5.18.1:** opening something (a Settings group, a connection's course list, Courses › Edit, lecture settings, a folded card) now scrolls just enough to show it, the way a chat jumps to the newest reply. Redraws never move the page.
- **Settings › Connections › Course tools:** Gradescope and Jupyter notebooks each have a tick to turn them on, off by default. Turning one on opens a list of your courses, all ticked; untick the ones that don't use it.
- **Courses stay uncluttered:** a course's Files tab, its Lectures ("From JupyterHub"), Export courses and the study plan only use Gradescope or Jupyter notebooks for the courses ticked for them.
- If you already used Gradescope or JupyterHub, they stay on for all your courses after this update.

## New in 5.17: easier to find your way
- **A "?" button at the top** shows or hides the explanations under things: blue when they're shown, gray when they're hidden. New students see them; once you know your way around, turn them off for a cleaner panel.
- **Today is about half as long:** what's due, today's plan, today's classes, questions to review (only when some are due), exams coming up and what's next. The old exam countdown card is gone (the study plan covers exams now); each exam has a **Quiz me** button for the lectures it covers.
- **Practice is now Study:** the lectures you're learning across all courses, with how much you've mastered and one click to continue, then reviews, quizzes, weak spots and progress. "Explain the Canvas page I'm on" lives here too.
- **Lectures come first** on a course's Lectures tab. Background reading, what "mastered" means and the AI list switch are behind a **Settings** button next to Arrange; recordings are listed after the lectures. Video speed is only in Settings › Connections › Lecture videos.
- **A course's Overview** shows how far you are with its lectures, with **Study the lectures** and **Course quiz**.
- **The grade calculator** matches the rest of CampusPilot and updates as you type (no Calculate button).
- **Easier to read and tap:** no text smaller than 12px, and icon buttons are at least 32px.
- Removed the course card for AI project packs (Courses › Export courses does it now).

## New in 5.16: simpler Settings, exports, automatic updates
- **Settings has fewer, clearer groups:** Account & sync, Your AI, Appearance (with Accessibility), On Canvas, Connections, Alerts, and Data & privacy. Nothing was lost; things moved next to what they control.
- **Courses › Edit** picks which courses CampusPilot shows ("Only my favorite courses" lives there now) and which have their lectures read ahead.
- **Courses › Export courses:** one zip (course-backup-<date>_<time>.zip) with everything from the courses you pick, laid out like Canvas, plus each course's connections: Gradescope work with graded copies, JupyterHub notebooks and data, and lecture transcripts. Chrome asks where to save it. A tip explains how to use it as an AI project's context.
- **Practice › Export for AI:** one Markdown file with your grades and deadlines, lecture checklists and how well you know each item, the questions you keep missing, your week and your study plan, written so an AI can read it.
- **The focus timer's** chime and notification switches are in the timer itself. **Google Calendar sync for My week** is a switch on My week.
- **Course card badges** are the two options under Appearance › Course cards (your setting carries over). **Video speed** sits with Lecture videos under Connections.
- **Automatic updates:** CampusPilot checks for updates every few hours and installs them as soon as nothing is in progress, then says what changed. Settings shows the version with a "Check for updates" button.
- **Settings text** now says correctly that your data syncs to your own Google Drive when you're signed in.
- Removed leftovers from the old "Plan my week" (study hours, session length, calendar busy-time link) and the old "Course text for your AI" export; My week, the study plan and the two exports replace them.

## New in 5.15: real dark themes on Canvas
- **Dark, Midnight, Dim and Glass Dark no longer flip Canvas's colors.** Instead of inverting the whole page, CampusPilot recolors it: light backgrounds become dark and dark text becomes light, each keeping its own hue. Profile pictures, photos, videos, course colors and course images stay exactly as they are.
- **Instructors' color coding survives:** a pale yellow note becomes a dark yellow note, red text stays red, and colored table cells keep their colors (darker).
- **Works on everything Canvas draws,** including its newer screens and content that loads or changes after the page opens. Hover colors are recolored too, and switching back to a light theme restores the page exactly.
- **Glass Dark** is real frosted dark glass over a deep color field.

## New in 5.14: sections you confirm, folding cards, Gradescope through Canvas
- **Confirm your sections one at a time** on My week: each course with several section, lab or lecture options gets its own step, with every option's days, times, room and TA side by side. Options that clash with classes you already have are flagged. "Not sure yet" leaves a choice for later.
- **Canvas helps pick your section:** CampusPilot reads which Canvas sections and groups you're in for each course and gives them to your AI with the syllabus. The option Canvas points to comes pre-selected, but you always confirm it.
- **Every course gets its class times:** courses are matched by their Canvas ID, so an AI shortening a course name no longer drops it. Courses that come back empty are listed on My week with the reason and an "Ask again for these" button, and an empty answer never wipes times found earlier.
- **Gradescope found in Canvas:** when a course's Canvas menu has a Gradescope link, its Files tab says "Gradescope found" with an **Open to sync** button. CampusPilot follows that link once in the background, so the right Gradescope course is linked with no name matching and no separate login.
- **Fold any card:** click a card's title (or press Enter on it) to collapse it to just the title; click again to open it. CampusPilot remembers what you folded, in the panel and on My week.
- **Text always fits:** long button labels wrap instead of being cut off, dropdowns size to their text (the search's "All courses"), due-date badges wrap on narrow panels, and the video speed row wraps.
- Fixed a stray "nullnullnull" under the search box.

## New in 5.13: JupyterHub notebooks as lectures
- **5.13.3:** the focus timer is just a timer: pick a length and start (no "what are you working on" step).
- **5.13.2:** the JupyterHub folder list lays out properly in a narrow panel, shows which notebooks each folder holds, and counts only real notebooks.
- **5.13.1:** Google Drive and Calendar errors now say why Google refused (for example, an API not turned on yet) instead of only a number.
- **Lecture notebooks join the Lectures tab** in their own "From JupyterHub" group, with checklists, parts, assessments, key terms and "Ask about this lecture", just like Canvas lectures. Questions point to a cell ("Lecture 3 · cell 4") instead of a slide.
- **What's in each folder:** on the course's notebooks card, mark each JupyterHub folder as lecture material, assignments or skip. CampusPilot guesses (folders named hw, lab, project, quiz or exam count as assignments).
- **Outputs and data go along:** your AI gets each cell with its output, the plots as images, and a short description of every data file the notebook uses (columns, types, rows), read a few kilobytes at a time so big datasets aren't downloaded.
- **Code questions use small made-up tables** shaped like the course data, so you practice the idea, not memorize the dataset.
- **The viewer shows notebooks** cell by cell with plots, and every question's cell link jumps right to it. "Open in JupyterHub" opens the real notebook.
- **Study plan sizing reads homework notebooks:** the question text and data descriptions go along with the assignment (matched by name, like "Lab 02" and lab2-pandas.ipynb), never your own code.
- New lecture notebooks are added to your AI list the first time CampusPilot sees them, like new Canvas lectures.

## New in 5.12: everything saves, and the gaps closed
- **Everything syncs** between your computers: your study plan, its progress and time estimates, the AI list, and My week (class times merge per course).
- **The AI list keeps going** if you close and reopen the panel, and new lectures are found in the background, not only when the panel opens.
- **Class times are kept out of study time**, so the plan never schedules work during a class you painted over.
- **Today's plan re-fits** when you change today's study time (checked-off sittings stay).
- **Lecture sections:** courses with several lecture times let you pick yours, like sections and labs.
- **"Possible change" flags** on My week for announcements that look like they move a class, office hours or a room.
- **Study time by keyboard:** add or remove it from a list on My week, not only by dragging.
- **Calendar files work in Outlook** too (they now describe your time zone's daylight-saving rules).
- **Plan updates reuse the plan's chat.**
- **"I know this"** asks about half the part (5 to 8 questions) and only counts the items it asked.
- **Course quiz** (Practice tab, and each module's menu): pick lectures and how much each counts; questions come from lecture mastery, missed ones first. Exam "Prep" opens it with that exam's lectures picked.
- **Ask about this lecture** opens the lecture's chat for questions in your own words. **Study guides** go to the lecture's chat too.
- **Old quick quizzes** are gone from lecture menus (old questions stay in Practice).
- **Canvas calendar:** your study time, planned work and class times are drawn onto Canvas's week and day views, lined up with its hours. Nothing is added to Canvas; a switch shows Canvas's calendar as it was.
- **Google Calendar:** "Keep My week in Google Calendar" adds your class times and planned study for the next two weeks and keeps them updated. Calendar access is now events-only (CampusPilot no longer reads your calendar).
- Privacy policy updated for class times, assignment estimates and study plans.

## New in 5.11: study plan
- **Pick what you're studying for:** courses, exams, assignments and lectures, how far ahead, and a note for your AI (Today › Study plan).
- **Your AI sizes each assignment once, from its actual files** (problem sets, lab instructions), and that estimate is kept. Each plan after that only sends short summaries, so it costs few tokens.
- **Your AI sets the priorities** from deadlines, grade weights, exams and what they cover, how much of each lecture you still have to learn, your own pace, and your weak spots.
- **CampusPilot fits the work into the study time on My week**, deadlines first, in sittings of 20 to 90 minutes. Today shows today's plan with Start and a check box; anything you don't check off moves to your next study time. Work that can't fit is called out.
- **The plan shows inside your study blocks on My week.**
- **It stays current:** new assignments or a week-old plan put a plan update in your AI list. Turned-in work and learned lecture items drop out by themselves.
- When the plan includes an exam, its countdown leaves the daily steps to the plan.
- The old "Plan my week" is gone.

## New in 5.10: one list for your AI
- **Today › For your AI** lists every request waiting for your AI: lecture checklists, part questions, key terms, class times. **Start** fills in the first one; when the answer comes in, CampusPilot adds it and fills in the next. You only press Send.
- **Things join on their own:** Part 1 right after a lecture's checklist, the next part once you've learned the one before, and (in courses where you've made a checklist) each new lecture as it's posted. Turn that off per course on the Lectures tab. Lectures already posted are never piled on.
- Asking for something while your AI is still answering puts it next in the list instead of interrupting.
- Remove anything from the list with ×; a removed lecture isn't added again.

## New in 5.9: My week
- **A weekly calendar of your classes and study time**, in its own tab (Today › My week).
- **Class times found for you.** One request to your AI covers all your courses: CampusPilot sends only the parts of your syllabi and course pages that mention days, times and places, and your AI lists lectures, every section and lab option, office hours, review sessions and days with no class.
- **Your own section.** Where a course lists several sections or labs, they show on the calendar as options; click yours (or pick it from the list) and the others disappear.
- **Office hours** are hidden until you turn on "Show office hours".
- **Study time.** Drag on the calendar where you're free to study. "Every week" changes your normal week; "Only this week" changes just this week.
- **Deadlines and exams** show on their days, with their times.
- **Add or remove anything** by hand; things you add yourself are kept when class times are found again.
- **Download calendar:** a calendar file (zipped) for Google, Apple or Outlook calendar. It's a copy, so download it again after changes.
- Today shows today's classes and study time.

## New in 5.8: lighter, clearer lecture mastery
- **One question per item** the first time through a part. A missed item, or one where you used a hint or looked at the lecture, gets one more question a few questions later, worded differently. The other versions come back on later days.
- **Fewer, bigger parts.** Your AI groups the checklist into study parts (about 10 to 15 minutes each) while writing it; CampusPilot evens out any that are too small or too big. Lectures already cut into many small parts get a "Combine into bigger parts" button; questions and progress stay.
- **Click the lecture and slide** shown on any question (assessments too) to open the lecture right there. If it's already open in a CampusPilot tab, that tab jumps to the slide.
- **"I know this"** on a part: 5 questions; all right without help and the part counts as learned.
- **Quiz timer.** Elapsed time in the corner (click to hide); results show total time, average per question and the questions that took longest.
- **Flashcards are the lecture's key terms**, written by your AI with the checklist (older checklists can get theirs with one short message). No more guessing terms from the slide text.
- Ordering questions say what to order by, and hints may not give the answer away.
- **Arrange modules (5.8.1).** On a course's Lectures tab, "Arrange" lets you pin modules to the top, move them up or down, and hide ones you don't need (they go to "Hidden modules" at the bottom). Click a module's name to collapse or expand it. Until you arrange a course, the current module and modules with new lectures open and the rest stay collapsed. Saved per course and synced; nothing changes in Canvas.
- **What "mastered" means, per course (5.8.1):** Quick (right once without help), Solid (right on 2 different days, the default) or Deep (right on 3 different days, including a problem where you apply it).

## New in 5.7: lecture mastery
- **One chat per lecture (5.7.5).** Parts, fill-ins and fresh assessments go to the same AI chat the checklist came from, which already has the file and the checklist, so requests are short and nothing is re-uploaded. If that chat was deleted, CampusPilot opens a new one with the file and the whole checklist instead.
- **One JupyterHub per course (5.7.4).** Each course can use its own hub. CampusPilot finds it from the course's "Open in Jupyter" links, or you type it once; a course can also be marked as not using Jupyter. "Get the latest course files first" now really runs before Practice and Download.
- **Picks up the answer by itself (5.7.3).** On AI sites you allowed for autofill, CampusPilot reads its own code block from the AI's tab once the AI has finished writing, so you don't have to copy anything. A reply that was stopped, cut off or hit an error is never added; CampusPilot says so and can ask your AI to redo it. A progress bar at the bottom of the panel shows what the AI is doing (writing, how many questions so far, done).
- **Lecture checklist.** Your AI reads the lecture file itself (text is sent only when the lecture is a Canvas page or a recording) and lists everything testable, slide by slide. CampusPilot checks it against its own reading of the file: every content slide must appear (or be marked as nothing to learn), and missing slides can be filled in with one click.
- **Parts in lecture order.** The checklist is split into parts; you make each part's questions when you're ready. Each part mixes in a few questions from earlier parts. Missed questions come back later in the session in different words.
- **Questions CampusPilot grades itself:** multiple choice with a reason for every option, true/false plus why, select all, matching, put the steps in order, numbers with tolerance, spot the mistake, step-by-step problems (worked example first), and explain-in-your-own-words graded by key points. Calculation problems use "fresh numbers" recipes run by a small built-in calculator that only does math.
- **Mastery per item:** an item is mastered once you've answered it right without help on two different days, with two different questions.
- **Assessments:** exam-style, random, from your bank (newest versions first), or brand-new from your AI. Results at the end, with links to the slides you missed.
- **Stuck?** On any practice question, before or after answering: opens the lecture at the exact slide in CampusPilot's slide viewer, with the item it teaches.

## New in 5.6
- **No false "Overdue" for Gradescope work.** With Gradescope connected, CampusPilot checks what you turned in there. Without it, past-due Gradescope work shows "Turned in on Gradescope?" and paper work shows "Past due".
- **Math and code in quizzes.** LaTeX (`$x^2$`, `$$\sum x_i$$`) is drawn with KaTeX (bundled); code shows in code blocks. Backslashes the AI forgets to escape are repaired.
- **Shuffled every time.** Question order and answer options change on every take ("All of the above" stays last).
- **Mastery levels and topic coverage.** Each lecture remembers its topics; the action sheet shows "8 of 11 covered", a level per topic (New, Learning, Familiar, Mastered), "Quiz me on the missing topics" and "Practice weak topics".
- **My mistakes.** Missed questions come back until you get each right twice in a row.
- **What changed.** Today lists due dates that moved, new work, new grades and exam date changes. Optional notifications for the important ones.
- **Focus timer.** Just 5 minutes, 15+5, 25+5, 50+10 or custom; runs in the background with the minutes left on the toolbar icon; time is logged per course (Practice › Focus time this week).
- **Exam countdown.** For the next exam within two weeks: what it covers (lectures since the last exam), how ready you are, and today's steps (fill gaps, review, weak topics; timed practice exams in the last two days).
- **Search everything** (the magnifier, or press /): slides by page, recordings by time (Panopto links jump to that moment), assignments, announcements, syllabi, exams and your questions. "Ask my AI using these results" sends the top excerpts.

## The side panel: Today · Courses · Practice · Settings

### New in 5.5
- **Video speed:** a small control on lecture videos (Canvas, Canvas Studio, your Panopto site, and optionally YouTube/Kaltura): − / + buttons, a slider, or type a speed (0.25–4×). Keys: S slower, D faster, R reset. The same speed is set from CampusPilot (Settings › Canvas pages, or a course's Lecture videos). It only changes playback speed; nothing is skipped.
- **Lecture video downloads:** transcripts as a zip of text files, or the video files themselves (only where the instructor allows downloads; saved as video files, not zipped). In Back up everything, transcripts and video files are separate boxes (video files off by default).
- **Size check:** any download over 200 MB says how big it is and asks first.

### New in 5.4
- **Exam dates** found automatically: exam-named assignments and calendar events in Canvas, announcements (newest first, so a moved exam is caught), and the syllabus, syllabus files and schedule pages. Shown on Today ("Exams coming up"), each course's Overview (fix or add any), Practice › Exam prep, and used by Plan my week.
- **Lecture videos:** connect your school's Panopto site once (Settings › Connections › Lecture videos; "Find it" detects it from your courses). Each course's Lectures page lists its recordings; CampusPilot reads the captions, so recordings get quizzes, flashcards and study guides like slides. Videos uploaded into Canvas pages have their captions added to that page's text automatically.
- **Sign in with Google:** syncs quizzes, progress, grade calculators, exam fixes and settings between computers through a private app folder in your own Google Drive. See SETUP-GOOGLE.md.

### Today
- What's overdue, due today and due this week, plus a "Next up" list with course colors.
- **Review**: the practice questions due today, one tap to start.
- **Plan my week**: your AI builds a schedule from your deadlines, grades and busy times. Copy its reply and come back; the sessions appear here. Add them to Google Calendar, or download a calendar file for any app.
- **Explain this page**: sends the Canvas page you're on to your AI.
- **Deadlines → calendar**.

### Courses
Each course has four pages:
- **Overview**: practice progress, what's coming up, announcements and recent grades. **Study guide** sends the course (syllabus, assignments, modules, announcements) to your AI.
- **Lectures**: every lecture page and slide deck, newest first, grouped by module. Filters are New for me, Lectures and Everything. Each lecture shows how much of it you've mastered. Tap a lecture or a module to open the action sheet.
- **Grades**: your Grade Ledger, filled in automatically. Canvas category weights are used when the course has them. Otherwise CampusPilot reads the syllabus: the Syllabus page, files and pages linked from it (PDF or Word), syllabus items in modules (or anything in a "Syllabus"/"Start here" module), then Pages and Files. If none of those give a breakdown, **Read the weights with my AI** sends the syllabus to your AI and fills in its answer. Edit anything for what-ifs; your edits are kept per course until **Reload from Canvas**. The final-exam calculator starts from your current score.
- **Files**: course files and your own submissions as one zip per course, your **Gradescope** work (graded copies with marks and comments when they're ready, otherwise what you turned in), an option to keep lecture slides in Downloads, Jupyter notebooks for that course, and a pack for an AI project.

### The action sheet (same everywhere)
- **Quizzes**: **Make a quiz** opens your AI with the lecture and the request already in the chat box (slides attached when they're needed). Press Send, copy the reply and come back. It becomes **Quiz 1**, the next one **Quiz 2**, and so on, each listed under the lecture with your best score. Retake any quiz; new quizzes avoid repeating earlier questions. **Mixed practice** draws from all of a lecture's questions, weakest first, and **Exam mode** gives a timed mix with answers at the end.
- **Flashcards**: key terms pulled from the lecture text with no AI needed, plus your practice questions.
- **Study guide**: a summary, key ideas and examples in your AI. **Quiz me in the chat** is the conversational version, which isn't tracked.
- **Download**: the slides and images as one zip.

Handwritten or scanned slides are attached automatically. When a lecture has diagrams, CampusPilot offers to send the slides as well.

### Practice
- **Today's review**: spaced repetition with Leitner boxes. Questions come back after 1, 3, 7, 16 and 35 days, and missed ones come back in 10 minutes.
- **Exam prep**: pick a course, the units and how many questions, with an optional timer.
- **Weak spots**: topics under 70% right, with one tap to practice them.
- **Progress** per course and your recent sessions.
- **Add questions you got elsewhere**: paste a reply from an AI on your phone.

Question types are multiple choice, true/false, short answer (you grade yourself against a model answer, with a suggestion) and flashcards. Keyboard shortcuts: A–F or 1–6 to answer, T/F, Space to flip, Enter for next, 1/2/3 to grade and Esc to close.

### Settings (grouped)
- **Your AI**: ChatGPT, Claude, Gemini, Copilot, another AI (name and address), or "just copy". You can also choose whether replies are picked up from the clipboard automatically.
- **Appearance**: course card style, size slider and minimal cards; the theme for Canvas and CampusPilot (Default, Glass, Glass Dark, Dark, Midnight, Dim and Paper; pictures keep their real colors), accent, nav bar, card style, course colors, font, text size, an easy-to-read font, high contrast and reduced motion.
- **Canvas pages**: Due soon list, Announcements in place of To Do, Recent grades in place of Recent Feedback, card badges and Practice buttons.
- **Study & quizzes**: questions per request, difficulty, and your study hours for plans.
- **Connections**: Canvas, calendar (a private iCal link or Google Calendar) and JupyterHub.
- **Courses**: only favorites, and which courses to hide.
- **Data & privacy**: background lecture prep, **Back up everything**, course text for your AI (with "only what's new") and AI project packs, question bank backup and restore, and clearing data.

### Back up everything
One zip for the courses you pick; Chrome asks where to save it. Inside, each course has:
- `Modules/01 <module>/01 <section>/…`: every file, page (.html), assignment and discussion in module order, split by the module's text headers, plus `Links.md` for web links.
- `Files/<Canvas folders>/…`: course files that aren't in a module.
- `Pages/`, `Assignments/`, `Discussions/`: anything not in a module.
- `Syllabus.html`, `Announcements.html`, `My grades.csv`.
- `My submissions/<assignment>/…`: your uploaded files and typed answers, plus `My submissions/Gradescope/…` when Gradescope is connected.
- `_Not included.txt`: quizzes, outside tools and locked items, which are never opened.

## How "any AI" works
1. CampusPilot opens your AI in a new tab and fills in the chat box with the request and any slides (Claude, ChatGPT, Gemini and Copilot; it asks once for access to that site). It never presses Send. For other AIs, or if filling in fails, the request is on your clipboard and the slides are in one folder.
2. You check it and press Send.
3. For questions and plans, the AI ends its reply with a small code block (`campuspilot-quiz` or `campuspilot-plan`). Copy the whole reply and switch back. CampusPilot reads the clipboard (only while it's waiting for a reply), or you can press **Paste reply**.

Nothing is sent anywhere by CampusPilot itself.

## On Canvas pages
These can be turned off in Settings › Canvas pages:
- Due soon list, Announcements and Recent grades cards with full-screen views.
- Grade and due-this-week chips on course cards.
- **Practice** buttons on lecture pages, slides and module headers, which open the action sheet in the side panel.
- Your theme and colors.

## Safety: what CampusPilot never touches
- Canvas is only ever **read** (GET requests). Nothing is submitted, posted or marked.
- **Quizzes, tests, exams and external tools** are never opened or fetched. Only their names and due dates appear, and the extension doesn't run on those pages.
- Locked and hidden items are skipped.
- Reading a course file through Canvas can count as "viewed" for module progress, the same as opening it yourself.

## Install
1. Unzip into a folder.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the folder that contains `manifest.json`.
4. Click the CampusPilot toolbar icon. Connect Canvas, then choose your AI.

Your data stays in this browser, including practice questions, progress and your grade calculator. Use Settings › Data & privacy › Save backup to move your questions to another computer.

## Gradescope
Connect it once (a course's Files page or Settings › Connections) and log in to gradescope.com with your school account. CampusPilot matches Gradescope courses to Canvas courses by name (you can change the match) and reads only through your own login. It only downloads submissions that exist; it never opens assignments you haven't submitted (opening a timed one can start its timer) and never submits anything. Gradescope has no public student API, so a change to their site can break this until CampusPilot is updated.

## Permissions
- Notifications (optional, asked only if you turn on alerts or timer notifications).
- Access to your AI's site (asked once, only for the AI you pick): fills in the chat box. Turn it off with Settings › Your AI › Fill it in for me.
- `clipboardRead` (new in v5): picks up your AI's reply when you come back to the panel. It only reads while a reply is expected, and you can turn it off.
- `offscreen`, `unlimitedStorage`: reading PDFs and slides, the lecture library and the question bank.
- `downloads`: zips in Downloads › CampusPilot.
- `identity`: optional Google Calendar sign-in.
- Optional site access, asked for when needed: your Canvas address if it isn't on instructure.com, Canvas's file storage, your calendar link and your JupyterHub.

## Google Calendar setup (optional, one time)
You don't need this. Plans and deadlines can also go into any calendar app as a file. For one-click adding:
1. In Google Cloud Console, create a project and enable the **Google Calendar API**.
2. Under **OAuth consent screen**, choose External, add the scopes `calendar.events` and `calendar.readonly`, and add yourself as a test user.
3. Under **Credentials → Create OAuth client ID**, choose **Chrome Extension** and paste your extension ID.
4. Put the client ID in `manifest.json` under `oauth2.client_id` and reload.

A Chrome Extension client ID isn't a secret and has no secret attached. It only works for the extension ID it was made for.

## Files
```
manifest.json            MV3
background.js            Sync, lectures, library, zips, grades data, Jupyter, calendar, badge
lib/canvas.js            Read-only Canvas API client
lib/safety.js            What's never opened (quizzes, tools, locked items)
lib/ai.js                "Your AI": providers, question requests, reading replies
lib/quiz.js              Question bank and named quizzes (IndexedDB), spaced review, sessions, auto flashcards
lib/autofill.js          Fills in the AI's chat box (never sends)
lib/exams.js             Exam dates from Canvas, announcements and syllabus text
lib/videos.js            Lecture video captions (Canvas media, Panopto)
lib/gradescope.js        Gradescope submissions and graded copies
lib/sync.js              Google sign-in and Drive app-folder sync (merge rules)
docs/privacy.html        Privacy policy, ready for GitHub Pages
SETUP-GOOGLE.md          Google sign-in setup, step by step
lib/grades.js            Canvas/syllabus weights → Grade Ledger rows
lib/packs.js             Study guides, plans, exports (Markdown for any AI)
lib/planparse.js         Reads a plan reply
lib/ics.js               Calendar files (deadlines, study sessions)
lib/jupyter*.js          JupyterHub access and notebook → Markdown
lib/extract.js           PDF/PPTX/DOCX reading, diagram and handwriting detection
lib/library.js           Lecture library (IndexedDB)
lib/look.js, icons.js    Themes and icons
grades/                  Grade Ledger (unchanged) + CampusPilot storage adapter and host
content/                 Canvas page features and theme
sidepanel/               main.js, core.js, aiflow.js, sheet.js, runner.js, views/
offscreen/, vendor/pdfjs Hidden file reader (pdf.js 4.10.38, Apache-2.0)
```
