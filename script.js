const subjects = [
  {
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT311",
    name: "Information Assurance and Security",
    accent: "#f43f5e",
    links: {
      // Replace "#" with your actual class resources whenever you have them.
      syllabus: "#",
      drive: "#",
      github: "#",
    },
  },
  {
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT313",
    name: "Mobile Programming",
    accent: "#10b981",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
    },
  },
  {
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT314",
    name: "Software Engineering",
    accent: "#6366f1",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
    },
  },
  {
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT315",
    name: "IT Elective 1",
    accent: "#8b5cf6",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
    },
  },
  {
    year: "4th Year",
    semester: "4th Year - 1st Semester",
    code: "IT413",
    name: "Social and Professional Issues",
    accent: "#f59e0b",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
    },
  },
];

const views = [
  { id: "overview", label: "Overview", title: "All Subjects", filter: () => true },
  { id: "third-year", label: "3rd Year", title: "3rd Year - 1st Semester", filter: (subject) => subject.year === "3rd Year" },
  { id: "fourth-year", label: "4th Year", title: "4th Year - 1st Semester", filter: (subject) => subject.year === "4th Year" },
];

const storagePrefix = "subjectDashboard.v1";
let activeView = "overview";

const desktopNav = document.querySelector("#desktopNav");
const mobileNav = document.querySelector("#mobileNav");
const subjectGrid = document.querySelector("#subjectGrid");
const template = document.querySelector("#subjectCardTemplate");
const viewEyebrow = document.querySelector("#viewEyebrow");
const viewTitle = document.querySelector("#viewTitle");
const progressFill = document.querySelector("#progressFill");
const progressPercent = document.querySelector("#progressPercent");
const progressBarA11y = document.querySelector("#progressBarA11y");
const menuToggle = document.querySelector("#menuToggle");
const menuClose = document.querySelector("#menuClose");
const mobileMenu = document.querySelector("#mobileMenu");

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

function renderNav(target) {
  target.innerHTML = "";

  views.forEach((view) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-button";
    button.textContent = view.label;
    button.setAttribute("aria-selected", String(view.id === activeView));
    button.addEventListener("click", () => {
      activeView = view.id;
      closeMobileMenu();
      renderDashboard();
    });
    target.append(button);
  });
}

function linkLabel(type) {
  return {
    syllabus: "Syllabus",
    drive: "Google Drive",
    github: "GitHub Repository",
  }[type];
}

function renderTaskList(list, subject, count) {
  const tasks = getTasks(subject.code);
  list.innerHTML = "";
  count.textContent = `${tasks.filter((task) => task.done).length}/${tasks.length} done`;

  if (tasks.length === 0) {
    const empty = document.createElement("li");
    empty.className = "rounded-lg border border-dashed border-white/10 px-3 py-3 text-sm text-slate-500";
    empty.textContent = "No tasks yet.";
    list.append(empty);
    return;
  }

  tasks.forEach((task) => {
    const row = document.createElement("li");
    row.className = `task-row ${task.done ? "is-complete" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.className = "task-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.setAttribute("aria-label", `Mark ${task.text} as complete`);
    checkbox.addEventListener("change", () => {
      const nextTasks = getTasks(subject.code).map((item) =>
        item.id === task.id ? { ...item, done: checkbox.checked } : item,
      );
      saveTasks(subject.code, nextTasks);
      renderTaskList(list, subject, count);
    });

    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;

    const remove = document.createElement("button");
    remove.className = "delete-task";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete ${task.text}`);
    remove.addEventListener("click", () => {
      const nextTasks = getTasks(subject.code).filter((item) => item.id !== task.id);
      saveTasks(subject.code, nextTasks);
      renderTaskList(list, subject, count);
    });

    row.append(checkbox, text, remove);
    list.append(row);
  });
}

function renderSubjectCard(subject) {
  const fragment = template.content.cloneNode(true);
  const shell = fragment.querySelector("[data-subject-card]");
  const code = fragment.querySelector(".subject-code");
  const title = fragment.querySelector(".subject-title");
  const semester = fragment.querySelector(".subject-semester");
  const chip = fragment.querySelector(".subject-chip");
  const links = fragment.querySelector("[data-links]");
  const input = fragment.querySelector(".task-input");
  const list = fragment.querySelector(".task-list");
  const count = fragment.querySelector(".task-count");
  const notes = fragment.querySelector(".notes-area");

  shell.style.setProperty("--accent", subject.accent);
  code.textContent = subject.code;
  title.textContent = subject.name;
  semester.textContent = subject.semester;
  chip.setAttribute("aria-hidden", "true");

  Object.entries(subject.links).forEach(([type, href]) => {
    const anchor = document.createElement("a");
    anchor.className = "quick-link";
    anchor.href = href;
    anchor.textContent = linkLabel(type);
    if (href !== "#") {
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
    }
    links.append(anchor);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const text = input.value.trim();
    if (!text) return;

    const nextTasks = [
      ...getTasks(subject.code),
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text,
        done: false,
      },
    ];
    saveTasks(subject.code, nextTasks);
    input.value = "";
    renderTaskList(list, subject, count);
  });

  notes.value = getNotes(subject.code);
  notes.addEventListener("input", () => saveNotes(subject.code, notes.value));
  renderTaskList(list, subject, count);

  requestAnimationFrame(() => shell.classList.add("is-visible"));
  return fragment;
}

function renderDashboard() {
  const view = views.find((item) => item.id === activeView) ?? views[0];
  const visibleSubjects = subjects.filter(view.filter);

  viewEyebrow.textContent = view.label;
  viewTitle.textContent = view.title;
  subjectGrid.innerHTML = "";
  visibleSubjects.forEach((subject) => subjectGrid.append(renderSubjectCard(subject)));

  renderNav(desktopNav);
  renderNav(mobileNav);
  updateProgress();
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
  menuToggle.classList.add("is-open");
  menuToggle.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}

function closeMobileMenu() {
  mobileMenu.classList.add("hidden");
  mobileMenu.setAttribute("aria-hidden", "true");
  menuToggle.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

menuToggle.addEventListener("click", openMobileMenu);
menuClose.addEventListener("click", closeMobileMenu);
mobileMenu.addEventListener("click", (event) => {
  if (event.target === mobileMenu) closeMobileMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMobileMenu();
});

renderDashboard();
