const subjects = [
  {
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT311",
    name: "Information Assurance and Security",
    accent: "#e11d48",
    meetingPlatform: "Google Meet",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
      facebook: "#",
      meeting: "#",
    },
  },
  {
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT313",
    name: "Mobile Programming",
    accent: "#059669",
    meetingPlatform: "Zoom",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
      facebook: "#",
      meeting: "#",
    },
  },
  {
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT314",
    name: "Software Engineering",
    accent: "#4f46e5",
    meetingPlatform: "Google Meet",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
      facebook: "#",
      meeting: "#",
    },
  },
  {
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT315",
    name: "IT Elective 1",
    accent: "#7c3aed",
    meetingPlatform: "Zoom",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
      facebook: "#",
      meeting: "#",
    },
  },
  {
    year: "4th Year",
    semester: "4th Year - 1st Semester",
    code: "IT413",
    name: "Social and Professional Issues",
    accent: "#d97706",
    meetingPlatform: "Google Meet",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
      facebook: "#",
      meeting: "#",
    },
  },
];

const navItems = [
  { id: "overview", label: "Overview", icon: "⌂", title: "Subject Dashboard", eyebrow: "Overview" },
  { id: "subjects", label: "Subjects", icon: "□", title: "All Subjects", eyebrow: "Coursework" },
  { id: "messenger", label: "Messenger / Facebook", icon: "✉", title: "Class Conversations", eyebrow: "Messenger" },
  { id: "meetings", label: "Meet / Zoom", icon: "◎", title: "Class Meeting Rooms", eyebrow: "Live Classes" },
  { id: "folders", label: "Subject Folders", icon: "▣", title: "Subject Folders", eyebrow: "Resources" },
];

const folderCategories = ["Assignments", "Projects", "Modules", "Lectures", "Links", "Other"];
const storagePrefix = "subjectDashboard.v1";

let activeView = "overview";
let searchQuery = "";

const desktopNav = document.querySelector("#desktopNav");
const mobileNav = document.querySelector("#mobileNav");
const appContent = document.querySelector("#appContent");
const viewEyebrow = document.querySelector("#viewEyebrow");
const viewTitle = document.querySelector("#viewTitle");
const progressPercent = document.querySelector("#progressPercent");
const progressFill = document.querySelector("#progressFill");
const progressBarA11y = document.querySelector("#progressBarA11y");
const todayPill = document.querySelector("#todayPill");
const searchInput = document.querySelector("#searchInput");
const menuToggle = document.querySelector("#menuToggle");
const menuClose = document.querySelector("#menuClose");
const mobileMenu = document.querySelector("#mobileMenu");
const resourceViewer = document.querySelector("#resourceViewer");
const resourceSubject = document.querySelector("#resourceSubject");
const resourceTitle = document.querySelector("#resourceTitle");
const resourceExternal = document.querySelector("#resourceExternal");
const resourceClose = document.querySelector("#resourceClose");
const resourceFrame = document.querySelector("#resourceFrame");
const resourceEmpty = document.querySelector("#resourceEmpty");
const resourceFallback = document.querySelector("#resourceFallback");

function storageKey(code, type) {
  return `${storagePrefix}.${code}.${type}`;
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTasks(code) {
  return readJson(storageKey(code, "tasks"), []);
}

function saveTasks(code, tasks) {
  writeJson(storageKey(code, "tasks"), tasks);
  updateProgress();
}

function getNotes(code) {
  return localStorage.getItem(storageKey(code, "notes")) ?? "";
}

function saveNotes(code, value) {
  localStorage.setItem(storageKey(code, "notes"), value);
}

function getResources(code) {
  return readJson(storageKey(code, "resources"), []);
}

function saveResources(code, resources) {
  writeJson(storageKey(code, "resources"), resources);
}

function getPortalSettings(subject) {
  return {
    facebook: "",
    meeting: "",
    meetingPlatform: subject.meetingPlatform,
    ...readJson(storageKey(subject.code, "portal"), {}),
  };
}

function savePortalSettings(subject, settings) {
  writeJson(storageKey(subject.code, "portal"), settings);
}

function filteredSubjects() {
  const term = searchQuery.trim().toLowerCase();
  if (!term) return subjects;
  return subjects.filter((subject) => {
    const resourceText = getResources(subject.code)
      .map((resource) => `${resource.title} ${resource.category} ${resource.note} ${resource.url}`)
      .join(" ");
    return `${subject.code} ${subject.name} ${subject.semester} ${resourceText}`.toLowerCase().includes(term);
  });
}

function linkLabel(type, subject) {
  return {
    syllabus: "Syllabus",
    drive: "Google Drive",
    github: "GitHub Repo",
    facebook: "Facebook / Messenger",
    meeting: subject?.meetingPlatform ?? "Meet / Zoom",
  }[type];
}

function renderNav(target) {
  target.innerHTML = "";
  navItems.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-button";
    button.setAttribute("aria-selected", String(item.id === activeView));
    button.innerHTML = `<span class="nav-icon">${item.icon}</span><span>${item.label}</span>`;
    button.addEventListener("click", () => {
      activeView = item.id;
      closeMobileMenu();
      renderApp();
    });
    target.append(button);
  });
}

function renderApp() {
  const view = navItems.find((item) => item.id === activeView) ?? navItems[0];
  viewEyebrow.textContent = view.eyebrow;
  viewTitle.textContent = view.title;
  renderNav(desktopNav);
  renderNav(mobileNav);
  updateProgress();

  const renderers = {
    overview: renderOverview,
    subjects: renderSubjects,
    messenger: renderMessenger,
    meetings: renderMeetings,
    folders: renderFolders,
  };
  renderers[activeView]();
}

function renderOverview() {
  const allTasks = subjects.flatMap((subject) => getTasks(subject.code));
  const completed = allTasks.filter((task) => task.done).length;
  const totalResources = subjects.reduce((sum, subject) => sum + getResources(subject.code).length, 0);
  appContent.innerHTML = "";
  appContent.append(
    metricGrid([
      ["Subjects", `${subjects.length}`, "Hardcoded course load for this dashboard.", "↗"],
      ["Completed Tasks", `${completed}/${allTasks.length}`, "Across every subject tracker.", "✓"],
      ["Folder Items", `${totalResources}`, "Assignments, projects, modules, lectures, and links.", "▣"],
    ]),
  );

  const layout = document.createElement("section");
  layout.className = "overview-grid";
  layout.append(renderSubjectTable(), renderTodayPanel());
  appContent.append(layout);
}

function metricGrid(items) {
  const grid = document.createElement("section");
  grid.className = "metric-grid";
  items.forEach(([title, value, text, icon]) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.innerHTML = `
      <div class="metric-top">
        <h3>${title}</h3>
        <span class="metric-orb">${icon}</span>
      </div>
      <strong>${value}</strong>
      <p>${text}</p>
    `;
    grid.append(card);
  });
  return grid;
}

function renderSubjectTable() {
  const card = document.createElement("section");
  card.className = "panel-card";
  card.innerHTML = `<h3>Subjects</h3><p class="panel-muted">Quick scan of your current course load.</p>`;

  const list = document.createElement("div");
  list.className = "resource-list";
  filteredSubjects().forEach((subject) => {
    const tasks = getTasks(subject.code);
    const done = tasks.filter((task) => task.done).length;
    const code = escapeHtml(subject.code);
    const name = escapeHtml(subject.name);
    const semester = escapeHtml(subject.semester);
    const row = document.createElement("article");
    row.className = "resource-row";
    row.style.setProperty("--accent", subject.accent);
    row.innerHTML = `
      <span class="subject-chip">${escapeHtml(subject.code.slice(2))}</span>
      <div class="resource-main">
        <span class="resource-category">${code}</span>
        <p class="resource-title-small">${name}</p>
        <p class="resource-note">${semester} · ${done}/${tasks.length} tasks · ${getResources(subject.code).length} folder items</p>
      </div>
      <button class="delete-task" type="button" aria-label="Open ${code} folders">›</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      activeView = "folders";
      renderApp();
      setTimeout(() => document.querySelector(`[data-folder="${subject.code}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    });
    list.append(row);
  });
  card.append(list);
  return card;
}

function renderTodayPanel() {
  const card = document.createElement("section");
  card.className = "panel-card";
  card.innerHTML = `
    <h3>Focus Board</h3>
    <p class="panel-muted">Use the folders menu to keep files, links, and class materials organized by subject.</p>
    <div class="section-label">Suggested Workflow</div>
    <ul class="resource-list">
      <li class="resource-row"><span class="metric-orb">1</span><div class="resource-main">Add the instructor's Messenger or Facebook link.</div><span></span></li>
      <li class="resource-row"><span class="metric-orb">2</span><div class="resource-main">Add each class Meet or Zoom URL.</div><span></span></li>
      <li class="resource-row"><span class="metric-orb">3</span><div class="resource-main">Store assignments, modules, lectures, and useful links in Subject Folders.</div><span></span></li>
    </ul>
  `;
  return card;
}

function renderSubjects() {
  const grid = document.createElement("section");
  grid.className = "subject-grid";
  filteredSubjects().forEach((subject) => grid.append(renderSubjectCard(subject)));
  appContent.innerHTML = "";
  appContent.append(grid);
}

function renderSubjectCard(subject) {
  const card = document.createElement("article");
  card.className = "subject-card";
  card.style.setProperty("--accent", subject.accent);
  card.innerHTML = `
    <div class="subject-head">
      <div class="min-w-0">
        <p class="subject-code">${escapeHtml(subject.code)}</p>
        <h2 class="subject-name">${escapeHtml(subject.name)}</h2>
        <p class="subject-semester">${escapeHtml(subject.semester)}</p>
      </div>
      <span class="subject-chip">${escapeHtml(subject.code.slice(2))}</span>
    </div>
    <div class="section-label">Quick Links</div>
    <div class="quick-link-row"></div>
    <div class="section-label">To-Do / Task Tracker</div>
    <input class="task-input" type="text" autocomplete="off" placeholder="Type a task and press Enter" />
    <ul class="task-list"></ul>
    <div class="section-label">Notes & Snippets</div>
    <textarea class="notes-area" rows="4" placeholder="Paste exam dates, links, commands, or reminders..."></textarea>
  `;

  const quickLinks = card.querySelector(".quick-link-row");
  ["syllabus", "drive", "github"].forEach((type) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-link";
    button.textContent = linkLabel(type, subject);
    button.addEventListener("click", () => openResourceViewer(subject, linkLabel(type, subject), subject.links[type]));
    quickLinks.append(button);
  });

  const input = card.querySelector(".task-input");
  const list = card.querySelector(".task-list");
  const notes = card.querySelector(".notes-area");
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const text = input.value.trim();
    if (!text) return;
    saveTasks(subject.code, [
      ...getTasks(subject.code),
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text, done: false },
    ]);
    input.value = "";
    renderTaskList(list, subject);
  });
  notes.value = getNotes(subject.code);
  notes.addEventListener("input", () => saveNotes(subject.code, notes.value));
  renderTaskList(list, subject);
  return card;
}

function renderTaskList(list, subject) {
  const tasks = getTasks(subject.code);
  list.innerHTML = "";
  if (tasks.length === 0) {
    const empty = document.createElement("li");
    empty.className = "resource-note";
    empty.textContent = "No tasks yet.";
    list.append(empty);
    return;
  }
  tasks.forEach((task) => {
    const taskText = escapeHtml(task.text);
    const row = document.createElement("li");
    row.className = `task-row ${task.done ? "is-complete" : ""}`;
    row.innerHTML = `
      <input class="task-checkbox" type="checkbox" ${task.done ? "checked" : ""} aria-label="Mark ${taskText} complete" />
      <span class="task-text">${taskText}</span>
      <button class="delete-task" type="button" aria-label="Delete ${taskText}">x</button>
    `;
    row.querySelector("input").addEventListener("change", (event) => {
      const next = getTasks(subject.code).map((item) => (item.id === task.id ? { ...item, done: event.target.checked } : item));
      saveTasks(subject.code, next);
      renderTaskList(list, subject);
    });
    row.querySelector("button").addEventListener("click", () => {
      saveTasks(subject.code, getTasks(subject.code).filter((item) => item.id !== task.id));
      renderTaskList(list, subject);
    });
    list.append(row);
  });
}

function renderMessenger() {
  renderPortalView("facebook", "Facebook / Messenger", "Add your class group chat or instructor page for each subject.");
}

function renderMeetings() {
  renderPortalView("meeting", "Meet / Zoom", "Add the meeting room your instructor uses for each subject.");
}

function renderPortalView(linkType, title, description) {
  const grid = document.createElement("section");
  grid.className = "portal-grid";
  filteredSubjects().forEach((subject) => {
    const settings = getPortalSettings(subject);
    const isMeeting = linkType === "meeting";
    const savedHref = isMeeting ? settings.meeting : settings.facebook;
    const savedPlatform = settings.meetingPlatform || subject.meetingPlatform;
    const card = document.createElement("article");
    card.className = "portal-card";
    card.style.setProperty("--accent", subject.accent);
    const label = isMeeting ? savedPlatform : title;
    card.innerHTML = `
      <p class="subject-code">${escapeHtml(subject.code)}</p>
      <h3>${escapeHtml(subject.name)}</h3>
      <p class="portal-label">${escapeHtml(description)}</p>
      <form class="portal-form">
        ${
          isMeeting
            ? `<select class="folder-select" aria-label="Meeting platform">
                ${["Google Meet", "Zoom", "Microsoft Teams", "Other"]
                  .map((platform) => `<option value="${platform}" ${platform === savedPlatform ? "selected" : ""}>${platform}</option>`)
                  .join("")}
              </select>`
            : ""
        }
        <input class="folder-input" name="portalUrl" autocomplete="off" placeholder="Paste link here" value="${escapeHtml(savedHref)}" />
        <button class="soft-button" type="submit">Save Link</button>
      </form>
      <button class="primary-button" type="button">Open ${escapeHtml(label)}</button>
      <p class="portal-label">Saved locally in this browser.</p>
    `;
    card.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const next = getPortalSettings(subject);
      const form = event.currentTarget;
      const url = form.querySelector('input[name="portalUrl"]').value.trim();
      if (isMeeting) {
        next.meeting = url;
        next.meetingPlatform = form.querySelector("select").value;
      } else {
        next.facebook = url;
      }
      savePortalSettings(subject, next);
      renderPortalView(linkType, title, description);
    });
    card.querySelector(".primary-button").addEventListener("click", () => {
      const latest = getPortalSettings(subject);
      const latestLabel = isMeeting ? latest.meetingPlatform : title;
      const latestHref = isMeeting ? latest.meeting : latest.facebook;
      openResourceViewer(subject, latestLabel, latestHref || subject.links[linkType]);
    });
    grid.append(card);
  });
  appContent.innerHTML = "";
  appContent.append(grid);
}

function renderFolders() {
  const grid = document.createElement("section");
  grid.className = "folder-grid";
  filteredSubjects().forEach((subject) => grid.append(renderFolderCard(subject)));
  appContent.innerHTML = "";
  appContent.append(grid);
}

function renderFolderCard(subject) {
  const card = document.createElement("article");
  card.className = "folder-card";
  card.dataset.folder = subject.code;
  card.style.setProperty("--accent", subject.accent);
  card.innerHTML = `
    <p class="subject-code">${escapeHtml(subject.code)}</p>
    <h3>${escapeHtml(subject.name)}</h3>
    <p class="panel-muted">Store assignments, projects, modules, lectures, links, and related notes for this subject.</p>
    <form class="folder-form">
      <select class="folder-select" aria-label="Resource category">
        ${folderCategories.map((category) => `<option value="${category}">${category}</option>`).join("")}
      </select>
      <input class="folder-input" name="title" autocomplete="off" placeholder="Title, file name, or topic" required />
      <input class="folder-input" name="url" autocomplete="off" placeholder="Optional URL" />
      <textarea class="folder-textarea" name="note" rows="3" placeholder="Optional note, deadline, instruction, or description"></textarea>
      <button class="primary-button" type="submit">Add to Folder</button>
    </form>
    <ul class="resource-list"></ul>
  `;
  const form = card.querySelector("form");
  const list = card.querySelector(".resource-list");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    if (!title) return;
    const resources = [
      ...getResources(subject.code),
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        category: card.querySelector(".folder-select").value,
        title,
        url: String(data.get("url") ?? "").trim(),
        note: String(data.get("note") ?? "").trim(),
      },
    ];
    saveResources(subject.code, resources);
    form.reset();
    renderResourceList(list, subject);
  });
  renderResourceList(list, subject);
  return card;
}

function renderResourceList(list, subject) {
  const resources = getResources(subject.code);
  list.innerHTML = "";
  if (resources.length === 0) {
    const empty = document.createElement("li");
    empty.className = "resource-note";
    empty.textContent = "No folder items yet.";
    list.append(empty);
    return;
  }
  resources.forEach((resource) => {
    const category = escapeHtml(resource.category);
    const title = escapeHtml(resource.title);
    const note = escapeHtml(resource.note || resource.url || "Saved in this subject folder.");
    const row = document.createElement("li");
    row.className = "resource-row";
    row.innerHTML = `
      <span class="metric-orb">▣</span>
      <div class="resource-main">
        <span class="resource-category">${category}</span>
        <p class="resource-title-small">${title}</p>
        <p class="resource-note">${note}</p>
      </div>
      <button class="delete-task" type="button" aria-label="Delete ${title}">x</button>
    `;
    row.querySelector(".resource-main").addEventListener("click", () => {
      if (resource.url) openResourceViewer(subject, resource.title, resource.url);
    });
    row.querySelector("button").addEventListener("click", () => {
      saveResources(subject.code, resources.filter((item) => item.id !== resource.id));
      renderResourceList(list, subject);
    });
    list.append(row);
  });
}

function updateProgress() {
  const allTasks = subjects.flatMap((subject) => getTasks(subject.code));
  const completed = allTasks.filter((task) => task.done).length;
  const percent = allTasks.length === 0 ? 0 : Math.round((completed / allTasks.length) * 100);
  progressPercent.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;
  progressBarA11y.setAttribute("aria-valuenow", String(percent));
}

function openMobileMenu() {
  mobileMenu.classList.remove("hidden");
  mobileMenu.setAttribute("aria-hidden", "false");
  menuToggle.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}

function closeMobileMenu() {
  mobileMenu.classList.add("hidden");
  mobileMenu.setAttribute("aria-hidden", "true");
  menuToggle.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

function openResourceViewer(subject, label, href) {
  const hasLink = href && href !== "#";
  resourceSubject.textContent = `${subject.code} - ${subject.name}`;
  resourceTitle.textContent = label;
  resourceExternal.href = hasLink ? href : "#";
  resourceExternal.classList.toggle("hidden", !hasLink);
  resourceEmpty.classList.toggle("hidden", hasLink);
  resourceFrame.classList.toggle("hidden", !hasLink);
  resourceFallback.classList.toggle("hidden", !hasLink);
  if (hasLink) resourceFrame.src = href;
  else resourceFrame.removeAttribute("src");
  resourceViewer.classList.remove("hidden");
  resourceViewer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeResourceViewer() {
  resourceViewer.classList.add("hidden");
  resourceViewer.setAttribute("aria-hidden", "true");
  resourceFrame.removeAttribute("src");
  document.body.style.overflow = "";
}

menuToggle.addEventListener("click", openMobileMenu);
menuClose.addEventListener("click", closeMobileMenu);
resourceClose.addEventListener("click", closeResourceViewer);
resourceViewer.addEventListener("click", (event) => {
  if (event.target === resourceViewer) closeResourceViewer();
});
searchInput.addEventListener("input", (event) => {
  searchQuery = event.target.value;
  renderApp();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobileMenu();
    closeResourceViewer();
  }
});

todayPill.textContent = new Intl.DateTimeFormat("en", { day: "2-digit", month: "short" }).format(new Date());
renderApp();
