"use client";

import { useEffect, useReducer, useRef, useState, FormEvent, ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { signIn, signOut, useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Inter } from "next/font/google";
import { useDropzone } from "react-dropzone";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  BarChart3,
  BadgeDollarSign,
  BookOpen,
  ChartSpline,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  FolderOpen,
  Globe,
  Home as HomeIcon,
  KeyRound,
  ListFilter,
  LoaderCircle,
  LogIn,
  LogOut,
  PencilLine,
  Paperclip,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Settings,
  Timer,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";

const headingFont = Inter({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type FloatingWindowState = {
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type DraggableWindowProps = {
  windowId: string;
  title: string;
  children: ReactNode;
  win: FloatingWindowState;
  isFocused: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  contentClassName?: string;
};

const MIN_WINDOW_WIDTH = 520;
const MIN_WINDOW_HEIGHT = 340;
const A4_RATIO_PORTRAIT = Math.SQRT2;
const MOCK_PAPER_A4_WIDTH_PX = 794;
const MOCK_PAPER_A4_HEIGHT_PX = Math.round(MOCK_PAPER_A4_WIDTH_PX * A4_RATIO_PORTRAIT);
const TOOL_CREDIT_COSTS = {
  timedSection: 0,
  parsePdf: 1,
  examChat: 1,
  extractDbq: 2,
  mockEdit: 2,
  gradeAnswer: 2,
  markingRules: 2,
  topicPredictor: 3,
  generateMockPaper: 3,
} as const;

const WINDOW_TOOL_CREDIT_COSTS = {
  "answer-key": TOOL_CREDIT_COSTS.generateMockPaper,
  "grade-answer": TOOL_CREDIT_COSTS.gradeAnswer,
  "marking-rules": TOOL_CREDIT_COSTS.markingRules,
  "topic-predictor": TOOL_CREDIT_COSTS.topicPredictor,
  "timed-section": TOOL_CREDIT_COSTS.timedSection,
} as const;

const STUDIO_TOOL_CREDIT_COSTS = {
  "answer-key": TOOL_CREDIT_COSTS.generateMockPaper,
  "grade-answer": TOOL_CREDIT_COSTS.gradeAnswer,
  "extract-dbq": TOOL_CREDIT_COSTS.extractDbq,
  "topic-predictor": TOOL_CREDIT_COSTS.topicPredictor,
  "marking-rules": TOOL_CREDIT_COSTS.markingRules,
  "timed-section": TOOL_CREDIT_COSTS.timedSection,
} as const;

const getWindowViewportBounds = (win: FloatingWindowState) => {
  if (typeof window === "undefined") {
    return { minX: 20, minY: 20, maxX: 20, maxY: 20 };
  }

  // Keep the titlebar reachable while preserving natural placement.
  const visibleTitlebarWidth = Math.min(win.width, 140);
  const minX = 0;
  const minY = 8;
  const maxX = Math.max(0, window.innerWidth - visibleTitlebarWidth);
  const maxY = Math.max(8, window.innerHeight - 56);

  return { minX, minY, maxX, maxY };
};

const clampWindowSizeToViewport = (win: FloatingWindowState, width: number, height: number) => {
  if (typeof window === "undefined") {
    return {
      width: Math.max(MIN_WINDOW_WIDTH, width),
      height: Math.max(MIN_WINDOW_HEIGHT, height),
    };
  }

  const maxWidth = Math.max(MIN_WINDOW_WIDTH, window.innerWidth - win.x - 20);
  const maxHeight = Math.max(MIN_WINDOW_HEIGHT, window.innerHeight - win.y - 20);

  return {
    width: Math.min(Math.max(MIN_WINDOW_WIDTH, width), maxWidth),
    height: Math.min(Math.max(MIN_WINDOW_HEIGHT, height), maxHeight),
  };
};

const clampWindowToViewport = (win: FloatingWindowState) => {
  if (typeof window === "undefined") {
    return { x: win.x, y: win.y };
  }

  const bounds = getWindowViewportBounds(win);

  return {
    x: Math.min(Math.max(bounds.minX, win.x), bounds.maxX),
    y: Math.min(Math.max(bounds.minY, win.y), bounds.maxY),
  };
};

const DraggableWindow = ({
  windowId,
  title,
  children,
  win,
  isFocused,
  onFocus,
  onClose,
  onMinimize,
  onToggleMaximize,
  onMove,
  onResize,
  contentClassName,
}: DraggableWindowProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const windowRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const draggingRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const startResizeFromCorner = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (win.isMaximized) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    resizingRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: win.width,
      startHeight: win.height,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const snapshot = resizingRef.current;
      if (!snapshot) {
        return;
      }

      const rawWidth = snapshot.startWidth + (moveEvent.clientX - snapshot.startX);
      const rawHeight = snapshot.startHeight + (moveEvent.clientY - snapshot.startY);
      const clampedSize = clampWindowSizeToViewport(win, rawWidth, rawHeight);
      onResize(clampedSize.width, clampedSize.height);
    };

    const onPointerUp = () => {
      resizingRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const startDragFromTitlebar = (event: React.PointerEvent<HTMLDivElement>) => {
    if (win.isMaximized) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("[data-window-control='true']")) {
      return;
    }

    // Prevent accidental text selection while initiating drag.
    event.preventDefault();

    draggingRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: win.x,
      originY: win.y,
    };

    setIsDragging(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const snapshot = draggingRef.current;
      if (!snapshot) {
        return;
      }

      const nextX = snapshot.originX + (moveEvent.clientX - snapshot.startX);
      const nextY = snapshot.originY + (moveEvent.clientY - snapshot.startY);
      const clamped = clampWindowToViewport({ ...win, x: nextX, y: nextY });
      onMove(clamped.x, clamped.y);
    };

    const onPointerUp = () => {
      draggingRef.current = null;
      setIsDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    if (!isFocused) {
      requestAnimationFrame(() => {
        onFocus();
      });
    }
  };

  const stopWindowControlDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  if (!win.isOpen || win.isMinimized) {
    return null;
  }

  return (
    <motion.div
      ref={windowRef}
      animate={win.isMaximized ? { left: 0, top: 0, width: "100vw", height: "100vh" } : undefined}
      transition={
        win.isMaximized
          ? { type: "spring", stiffness: 320, damping: 28 }
          : { type: "tween", duration: 0 }
      }
      style={{
        zIndex: win.zIndex,
        ...(win.isMaximized ? {} : { left: win.x, top: win.y, width: win.width, height: win.height }),
      }}
      className={`fixed overflow-hidden border border-slate-200 bg-white/95 shadow-xl transform-gpu will-change-transform ${
        win.isMaximized ? "rounded-none" : "rounded-xl"
      }`}
    >
      <div
        onPointerDownCapture={startDragFromTitlebar}
        className={`flex select-none touch-none items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-window-control="true"
            onPointerDown={stopWindowControlDrag}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="h-3.5 w-3.5 rounded-full bg-rose-500 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
            aria-label={`Close ${windowId} window`}
          />
          <button
            type="button"
            data-window-control="true"
            onPointerDown={stopWindowControlDrag}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onMinimize();
            }}
            className="h-3.5 w-3.5 rounded-full bg-amber-400 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
            aria-label={`Minimize ${windowId} window`}
          />
          <button
            type="button"
            data-window-control="true"
            onPointerDown={stopWindowControlDrag}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleMaximize();
            }}
            className="h-3.5 w-3.5 rounded-full bg-emerald-500 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
            aria-label={`Toggle maximize ${windowId} window`}
          />
        </div>
        <h2 className="pointer-events-none select-none text-sm font-semibold text-slate-700">{title}</h2>
        <div className="w-[50px]" />
      </div>
      <div className={contentClassName ?? "h-full overflow-y-auto p-5"}>{children}</div>
      {!win.isMaximized ? (
        <button
          type="button"
          onPointerDown={startResizeFromCorner}
          className="absolute right-1 bottom-1 h-5 w-5 cursor-nwse-resize rounded-sm bg-slate-300/70 transition hover:bg-slate-400/80"
          aria-label={`Resize ${windowId} window`}
        />
      ) : null}
    </motion.div>
  );
};

export default function Home() {
  type AppView = "workspace" | "vault" | "analytics" | "syllabus" | "purchase";
  type MarketplacePanel = "store" | "usage";
  type CoverEditableField = "learnerName" | "examDate" | "focusSubject" | "streakDays" | "dailyMission";
  type WindowId = "answer-key" | "grade-answer" | "marking-rules" | "topic-predictor" | "timed-section";
  type DesktopWindow = {
    id: WindowId;
    title: string;
    isOpen: boolean;
    isMinimized: boolean;
    isMaximized: boolean;
    zIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  type DesktopState = {
    windows: Record<WindowId, DesktopWindow>;
    focusedId: WindowId | null;
    zCounter: number;
  };
  type DesktopAction =
    | { type: "OPEN_WINDOW"; id: WindowId }
    | { type: "CLOSE_WINDOW"; id: WindowId }
    | { type: "MINIMIZE_WINDOW"; id: WindowId }
    | { type: "FOCUS_WINDOW"; id: WindowId }
    | { type: "TOGGLE_MAXIMIZE"; id: WindowId }
    | { type: "MOVE_WINDOW"; id: WindowId; x: number; y: number }
    | { type: "RESIZE_WINDOW"; id: WindowId; width: number; height: number };

  const initialDesktopState: DesktopState = {
    windows: {
      "answer-key": {
        id: "answer-key",
        title: "Generate Mock Paper",
        isOpen: false,
        isMinimized: false,
        isMaximized: false,
        zIndex: 19,
        x: 120,
        y: 80,
        width: 940,
        height: 640,
      },
      "grade-answer": {
        id: "grade-answer",
        title: "Grade My Answer",
        isOpen: false,
        isMinimized: false,
        isMaximized: false,
        zIndex: 20,
        x: 150,
        y: 90,
        width: 900,
        height: 620,
      },
      "marking-rules": {
        id: "marking-rules",
        title: "Syllabus Marking Rules",
        isOpen: false,
        isMinimized: false,
        isMaximized: false,
        zIndex: 21,
        x: 220,
        y: 110,
        width: 920,
        height: 640,
      },
      "topic-predictor": {
        id: "topic-predictor",
        title: "Syllabus Predictor Radar",
        isOpen: false,
        isMinimized: false,
        isMaximized: false,
        zIndex: 22,
        x: 290,
        y: 130,
        width: 920,
        height: 620,
      },
      "timed-section": {
        id: "timed-section",
        title: "Timed Section",
        isOpen: false,
        isMinimized: false,
        isMaximized: false,
        zIndex: 23,
        x: 320,
        y: 110,
        width: 620,
        height: 470,
      },
    },
    focusedId: null,
    zCounter: 23,
  };

  const desktopReducer = (state: DesktopState, action: DesktopAction): DesktopState => {
    const nextZ = state.zCounter + 1;
    const currentWindow = state.windows[action.id as WindowId];
    const getClampedPosition = (x: number, y: number) =>
      clampWindowToViewport({
        isOpen: currentWindow.isOpen,
        isMinimized: currentWindow.isMinimized,
        isMaximized: currentWindow.isMaximized,
        zIndex: currentWindow.zIndex,
        x,
        y,
        width: currentWindow.width,
        height: currentWindow.height,
      });

    switch (action.type) {
      case "OPEN_WINDOW": {
        const openPos = getClampedPosition(currentWindow.x, currentWindow.y);
        return {
          ...state,
          windows: {
            ...state.windows,
            [action.id]: {
              ...currentWindow,
              isOpen: true,
              isMinimized: false,
              x: openPos.x,
              y: openPos.y,
              zIndex: nextZ,
            },
          },
          focusedId: action.id,
          zCounter: nextZ,
        };
      }
      case "CLOSE_WINDOW": {
        return {
          ...state,
          windows: {
            ...state.windows,
            [action.id]: {
              ...currentWindow,
              isOpen: false,
              isMinimized: false,
              isMaximized: false,
            },
          },
          focusedId: state.focusedId === action.id ? null : state.focusedId,
        };
      }
      case "MINIMIZE_WINDOW": {
        return {
          ...state,
          windows: {
            ...state.windows,
            [action.id]: {
              ...currentWindow,
              isMinimized: !currentWindow.isMinimized,
              zIndex: nextZ,
            },
          },
          focusedId: currentWindow.isMinimized ? action.id : state.focusedId,
          zCounter: nextZ,
        };
      }
      case "FOCUS_WINDOW": {
        return {
          ...state,
          windows: {
            ...state.windows,
            [action.id]: {
              ...currentWindow,
              zIndex: nextZ,
            },
          },
          focusedId: action.id,
          zCounter: nextZ,
        };
      }
      case "TOGGLE_MAXIMIZE": {
        const nextIsMaximized = !currentWindow.isMaximized;
        const restoredPos = getClampedPosition(currentWindow.x, currentWindow.y);
        return {
          ...state,
          windows: {
            ...state.windows,
            [action.id]: {
              ...currentWindow,
              isMaximized: nextIsMaximized,
              isMinimized: false,
              x: nextIsMaximized ? currentWindow.x : restoredPos.x,
              y: nextIsMaximized ? currentWindow.y : restoredPos.y,
              zIndex: nextZ,
            },
          },
          focusedId: action.id,
          zCounter: nextZ,
        };
      }
      case "MOVE_WINDOW": {
        return {
          ...state,
          windows: {
            ...state.windows,
            [action.id]: {
              ...currentWindow,
              x: action.x,
              y: action.y,
            },
          },
        };
      }
      case "RESIZE_WINDOW": {
        const nextSize = clampWindowSizeToViewport(currentWindow, action.width, action.height);
        return {
          ...state,
          windows: {
            ...state.windows,
            [action.id]: {
              ...currentWindow,
              width: nextSize.width,
              height: nextSize.height,
            },
          },
        };
      }
      default:
        return state;
    }
  };
  type CommandWordRule = { word: string; requirement: string };
  type MarkBandRule = { level: string; marks: string; criteria: string };
  type MarkingRulesData = {
    commandWords: CommandWordRule[];
    markBands: MarkBandRule[];
    checklist: string[];
    rawResponse: string;
  };
  type TopicPrediction = { topic: string; confidence: "High" | "Medium" | "Low"; evidence: string };
  type TopicPredictorData = { predictions: TopicPrediction[]; rawResponse: string };
  type MockPaperChatMessage = { role: "user" | "assistant"; text: string };
  type MockPaperGenerationStage = "idle" | "analyzing" | "template" | "drafting" | "markscheme" | "formatting" | "done";
  type ParseDiagnostics = {
    selectedPass: "primary" | "alternate-mode" | "scan-fallback" | "legacy-gpt4o" | null;
    passes: Array<{
      pass: "primary" | "alternate-mode" | "scan-fallback" | "legacy-gpt4o";
      uploadStatus: number;
      jobId?: string;
      pollStatus?: string;
      extractedChars: number;
      error?: string;
    }>;
  };
  type SourceRole = "question-paper" | "marking-scheme" | "model-answer" | "notes";
  type SourceItem = {
    id: string;
    name: string;
    role: SourceRole;
    text: string;
    selected: boolean;
  };
  type PersistedCover = {
    learnerName: string;
    examDateInput: string;
    focusSubject: string;
    streakDays: number;
    dailyMission: string;
  };
  type PersistedDrafts = {
    gradingAnswer: string;
    markingRulesDraft: string;
    answerKeyOutput: string;
    gradingFeedbackDraft: string;
    topicPredictorDraft: string;
  };
  type PersistedWorkspace = {
    sourceLibrary: SourceItem[];
    activeSourceId: string | null;
    sourceText: string;
    cover: PersistedCover;
    drafts: PersistedDrafts;
  };

  const {
    messages: workspaceMessages,
    sendMessage: sendWorkspaceMessage,
    status: workspaceStatus,
  } = useChat({ id: "workspace-chat", experimental_throttle: 24 });
  const {
    messages: gradingMessages,
    sendMessage: sendGradingMessage,
    status: gradingStatus,
  } = useChat({ id: "grading-chat", experimental_throttle: 80 });
  const [input, setInput] = useState("");
  const workspaceIsLoading = workspaceStatus === "submitted" || workspaceStatus === "streaming";
  const gradingIsLoading = gradingStatus === "submitted" || gradingStatus === "streaming";
  const [activeView, setActiveView] = useState<AppView>("workspace");
  const [isSourceCollapsed, setIsSourceCollapsed] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isEngineCollapsed, setIsEngineCollapsed] = useState(false);
  const [workspaceCompactPane, setWorkspaceCompactPane] = useState<"source" | "chat" | "engine">("source");
  const [isCompactWorkspace, setIsCompactWorkspace] = useState(false);
  const [isDualPaneCompact, setIsDualPaneCompact] = useState(false);
  const [showStartupSplash, setShowStartupSplash] = useState(true);
  const [splashStage, setSplashStage] = useState<"idle" | "expand" | "exit">("idle");
  const [showCoverPage, setShowCoverPage] = useState(true);
  const [coverTransitioning, setCoverTransitioning] = useState(false);
  const [learnerName, setLearnerName] = useState("Scholar");
  const [examDateInput, setExamDateInput] = useState("2026-11-10");
  const [focusSubject, setFocusSubject] = useState("History");
  const [streakDays, setStreakDays] = useState(5);
  const [dailyMission, setDailyMission] = useState(
    "Complete one timed DBQ in 25 minutes and self-grade with marking rules.",
  );
  const [editingFields, setEditingFields] = useState<Record<CoverEditableField, boolean>>({
    learnerName: false,
    examDate: false,
    focusSubject: false,
    streakDays: false,
    dailyMission: false,
  });

  const [sourceText, setSourceText] = useState("");
  const [sourceLibrary, setSourceLibrary] = useState<SourceItem[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [parseDiagnostics, setParseDiagnostics] = useState<ParseDiagnostics | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [parseStage, setParseStage] = useState<"idle" | "uploading" | "processing" | "failed">("idle");
  const [gradingAnswer, setGradingAnswer] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [desktopState, dispatchDesktop] = useReducer(desktopReducer, initialDesktopState);
  const [timedSectionName, setTimedSectionName] = useState("Section B");
  const [timedMinutes, setTimedMinutes] = useState(15);
  const [secondsLeft, setSecondsLeft] = useState(15 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [markingRulesLoading, setMarkingRulesLoading] = useState(false);
  const [markingRulesError, setMarkingRulesError] = useState<string | null>(null);
  const [markingRulesData, setMarkingRulesData] = useState<MarkingRulesData | null>(null);
  const [markingRulesDraft, setMarkingRulesDraft] = useState("");
  const [isEditingMarkingRulesDraft, setIsEditingMarkingRulesDraft] = useState(false);
  const [markingRulesExportFormat, setMarkingRulesExportFormat] = useState<"doc" | "pdf">("doc");
  const [answerKeyLoading, setAnswerKeyLoading] = useState(false);
  const [answerKeyError, setAnswerKeyError] = useState<string | null>(null);
  const [mockPaperNotice, setMockPaperNotice] = useState<string | null>(null);
  const [answerKeyOutput, setAnswerKeyOutput] = useState("");
  const [isEditingAnswerKeyOutput, setIsEditingAnswerKeyOutput] = useState(false);
  const [answerKeyExportFormat, setAnswerKeyExportFormat] = useState<"doc" | "pdf">("doc");
  const [mockPaperDifficulty, setMockPaperDifficulty] = useState<"balanced" | "exam-hard" | "mostly-medium">("balanced");
  const [mockPaperChatInput, setMockPaperChatInput] = useState("");
  const [mockPaperChatMessages, setMockPaperChatMessages] = useState<MockPaperChatMessage[]>([]);
  const [mockPaperChatLoading, setMockPaperChatLoading] = useState(false);
  const [mockPaperChatError, setMockPaperChatError] = useState<string | null>(null);
  const [mockPaperEditQueue, setMockPaperEditQueue] = useState<string[]>([]);
  const [mockPaperGenerationStage, setMockPaperGenerationStage] = useState<MockPaperGenerationStage>("idle");
  const [mockPaperPreviewZoom, setMockPaperPreviewZoom] = useState(80);
  const [sourcePdfUrls, setSourcePdfUrls] = useState<Record<string, string>>({});
  const [showTemplateUnderlay, setShowTemplateUnderlay] = useState(true);
  const [gradingExportFormat, setGradingExportFormat] = useState<"doc" | "pdf">("doc");
  const [gradingFeedbackDraft, setGradingFeedbackDraft] = useState("");
  const [isEditingGradingFeedback, setIsEditingGradingFeedback] = useState(false);
  const [topicPredictorLoading, setTopicPredictorLoading] = useState(false);
  const [topicPredictorError, setTopicPredictorError] = useState<string | null>(null);
  const [topicPredictorData, setTopicPredictorData] = useState<TopicPredictorData | null>(null);
  const [topicPredictorDraft, setTopicPredictorDraft] = useState("");
  const [isEditingTopicPredictorDraft, setIsEditingTopicPredictorDraft] = useState(false);
  const [topicPredictorExportFormat, setTopicPredictorExportFormat] = useState<"doc" | "pdf">("doc");
  const [clockNow, setClockNow] = useState(() => new Date());
  const motivationLines = [
    "Small steps today become calm confidence on exam day.",
    "Train under pressure now, perform with clarity later.",
    "Consistency is your unfair advantage.",
    "One focused session now saves hours of panic later.",
  ];
  const [motivationIndex, setMotivationIndex] = useState(() => new Date().getDate() % motivationLines.length);
  const { data: session, status: authStatus } = useSession();
  const isAuthenticated = authStatus === "authenticated";
  const isAuthLoading = authStatus === "loading";
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authNameInput, setAuthNameInput] = useState("");
  const [authEmailInput, setAuthEmailInput] = useState("");
  const [authPasswordInput, setAuthPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [userCredits, setUserCredits] = useState(20);
  const [isInfiniteCredits, setIsInfiniteCredits] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const isCreditsDepleted = !isInfiniteCredits && userCredits <= 0;
  const [marketplacePanel, setMarketplacePanel] = useState<MarketplacePanel>("store");
  const hasHydratedWorkspace = useRef(false);
  const [workspaceReadyToSave, setWorkspaceReadyToSave] = useState(false);
  const [animatedWorkspaceText, setAnimatedWorkspaceText] = useState("");
  const lastAnimatedAssistantId = useRef<string | null>(null);
  const sourcePdfUrlsRef = useRef<Record<string, string>>({});
  const mockPaperPreviewRef = useRef<HTMLDivElement | null>(null);

  const buildLearnerProfileContext = () => {
    const safeName = learnerName.trim() || "Scholar";
    const safeSubject = focusSubject.trim() || "General";
    const safeMission = dailyMission.trim() || "Complete one focused study task.";
    const safeExamDate = examDateInput.trim() || "Not set";

    return [
      `- Name: ${safeName}`,
      `- Focus Subject: ${safeSubject}`,
      `- Exam Date: ${safeExamDate}`,
      `- Current Streak: ${streakDays} days`,
      `- Daily Mission: ${safeMission}`,
      "- Tone Preference: supportive examiner-coach, concise first, expand on request",
      "- Formatting Preference: short bullets for complex outputs; plain short answer for simple queries",
    ].join("\n");
  };

  useEffect(() => {
    if (!session?.user?.name || hasHydratedWorkspace.current) {
      return;
    }

    setLearnerName(session.user.name);
  }, [session?.user?.name]);

  useEffect(() => {
    if (!isAuthenticated || !session?.user?.id) {
      return;
    }

    let cancelled = false;

    const loadCredits = async () => {
      const response = await fetch("/api/credits", { method: "GET" });
      if (!response.ok) {
        return;
      }

      const result = (await response.json()) as { credits?: number; infinite?: boolean };
      if (!cancelled) {
        setIsInfiniteCredits(Boolean(result.infinite));
      }
      if (!cancelled && typeof result.credits === "number") {
        setUserCredits(Math.max(0, Math.floor(result.credits)));
      }
    };

    void loadCredits();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, session?.user?.id]);

  useEffect(() => {
    sourcePdfUrlsRef.current = sourcePdfUrls;
  }, [sourcePdfUrls]);

  useEffect(() => {
    return () => {
      Object.values(sourcePdfUrlsRef.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  useEffect(() => {
    if (answerKeyLoading || mockPaperChatLoading || mockPaperEditQueue.length === 0) {
      return;
    }

    if (!answerKeyOutput.trim()) {
      return;
    }

    const [nextInstruction, ...remaining] = mockPaperEditQueue;
    setMockPaperEditQueue(remaining);
    void applyMockPaperInstruction(nextInstruction, true);
  }, [answerKeyLoading, mockPaperChatLoading, mockPaperEditQueue, answerKeyOutput]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const rawError = params.get("authError") || params.get("error");
    if (!rawError) {
      return;
    }

    if (rawError === "OAuthAccountNotLinked") {
      setAuthError("This email is already linked to another sign-in method. Try your original method or another Google account.");
      return;
    }

    if (rawError === "AccessDenied") {
      setAuthError("Google sign-in access denied. Please try another account.");
      return;
    }

    setAuthError("Google sign-in failed. Please try again.");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateCompactWorkspace = () => {
      const width = window.innerWidth;
      setIsCompactWorkspace(width < 1280);
      setIsDualPaneCompact(width >= 900 && width < 1280);
    };

    updateCompactWorkspace();
    window.addEventListener("resize", updateCompactWorkspace);

    return () => {
      window.removeEventListener("resize", updateCompactWorkspace);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !session?.user?.id) {
      hasHydratedWorkspace.current = false;
      setWorkspaceReadyToSave(false);
      return;
    }

    let cancelled = false;

    const loadWorkspace = async () => {
      try {
        const response = await fetch("/api/workspace", { method: "GET" });
        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as {
          workspace?: {
            sourceLibrary?: SourceItem[];
            activeSourceId?: string | null;
            sourceText?: string | null;
            cover?: Partial<PersistedCover> | null;
            drafts?: Partial<PersistedDrafts> | null;
          } | null;
        };

        if (cancelled || !result.workspace) {
          return;
        }

        const workspace = result.workspace;
        const validRoles: SourceRole[] = ["question-paper", "marking-scheme", "model-answer", "notes"];
        const nextSources = Array.isArray(workspace.sourceLibrary)
          ? workspace.sourceLibrary.filter(
              (item): item is SourceItem =>
                typeof item?.id === "string" &&
                typeof item.name === "string" &&
                typeof item.role === "string" &&
                validRoles.includes(item.role as SourceRole) &&
                typeof item.text === "string" &&
                typeof item.selected === "boolean",
            )
          : [];

        const persistedActiveId =
          typeof workspace.activeSourceId === "string" && nextSources.some((item) => item.id === workspace.activeSourceId)
            ? workspace.activeSourceId
            : null;

        setIsParsing(false);
        setParseDiagnostics(null);
        setSourceLibrary(nextSources);
        setSourcePdfUrls({});
        setActiveSourceId(persistedActiveId);
        setSourceText(
          typeof workspace.sourceText === "string"
            ? workspace.sourceText
            : nextSources.find((item) => item.id === persistedActiveId)?.text ?? "",
        );

        if (workspace.cover) {
          if (typeof workspace.cover.learnerName === "string") setLearnerName(workspace.cover.learnerName);
          if (typeof workspace.cover.examDateInput === "string") setExamDateInput(workspace.cover.examDateInput);
          if (typeof workspace.cover.focusSubject === "string") setFocusSubject(workspace.cover.focusSubject);
          if (typeof workspace.cover.streakDays === "number") setStreakDays(Math.max(0, workspace.cover.streakDays));
          if (typeof workspace.cover.dailyMission === "string") setDailyMission(workspace.cover.dailyMission);
        }

        if (workspace.drafts) {
          if (typeof workspace.drafts.gradingAnswer === "string") setGradingAnswer(workspace.drafts.gradingAnswer);
          if (typeof workspace.drafts.markingRulesDraft === "string") setMarkingRulesDraft(workspace.drafts.markingRulesDraft);
          if (typeof workspace.drafts.answerKeyOutput === "string") setAnswerKeyOutput(workspace.drafts.answerKeyOutput);
          if (typeof workspace.drafts.gradingFeedbackDraft === "string") setGradingFeedbackDraft(workspace.drafts.gradingFeedbackDraft);
          if (typeof workspace.drafts.topicPredictorDraft === "string") setTopicPredictorDraft(workspace.drafts.topicPredictorDraft);
        }
      } finally {
        if (!cancelled) {
          hasHydratedWorkspace.current = true;
          setWorkspaceReadyToSave(true);
        }
      }
    };

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, session?.user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceReadyToSave || !hasHydratedWorkspace.current) {
      return;
    }

    const payload: PersistedWorkspace = {
      sourceLibrary,
      activeSourceId,
      sourceText,
      cover: {
        learnerName,
        examDateInput,
        focusSubject,
        streakDays,
        dailyMission,
      },
      drafts: {
        gradingAnswer,
        markingRulesDraft,
        answerKeyOutput,
        gradingFeedbackDraft,
        topicPredictorDraft,
      },
    };

    const timer = window.setTimeout(() => {
      void fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    isAuthenticated,
    workspaceReadyToSave,
    sourceLibrary,
    activeSourceId,
    sourceText,
    learnerName,
    examDateInput,
    focusSubject,
    streakDays,
    dailyMission,
    gradingAnswer,
    markingRulesDraft,
    answerKeyOutput,
    gradingFeedbackDraft,
    topicPredictorDraft,
  ]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Good morning";
    }
    if (hour < 18) {
      return "Good afternoon";
    }
    return "Good evening";
  };

  const examDate = new Date(`${examDateInput}T00:00:00`);
  const daysToExam = Math.max(
    0,
    Number.isNaN(examDate.getTime())
      ? 0
      : Math.ceil((examDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
  );
  const clockTimeLabel = clockNow.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const clockDateLabel = clockNow.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const checkCreditsEnough = async (amount: number, feature: string) => {
    if (amount <= 0) {
      return true;
    }

    if (isInfiniteCredits) {
      setCreditError(null);
      return true;
    }

    if (userCredits < amount) {
      setCreditError(`Not enough credits for ${feature}.`);
      return false;
    }

    try {
      const response = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, feature, mode: "check" }),
      });

      if (response.ok) {
        setCreditError(null);
        return true;
      }

      const result = (await response.json().catch(() => ({}))) as { error?: string; credits?: number; infinite?: boolean };
      if (typeof result.infinite === "boolean") {
        setIsInfiniteCredits(result.infinite);
      }
      if (typeof result.credits === "number") {
        const latestCredits = Math.max(0, Math.floor(result.credits));
        setUserCredits(latestCredits);
        if (latestCredits < amount) {
          setCreditError(result.error || `Not enough credits for ${feature}.`);
          return false;
        }
      }

      if (response.status === 409) {
        setCreditError(result.error || `Not enough credits for ${feature}.`);
        return false;
      }

      // Do not block tool usage on transient credit API failures.
      setCreditError(null);
      return true;
    } catch {
      setCreditError(null);
      return true;
    }
  };

  const deductCredits = async (amount: number, feature: string) => {
    if (amount <= 0) {
      return true;
    }

    if (isInfiniteCredits) {
      setCreditError(null);
      return true;
    }

    if (userCredits < amount) {
      setCreditError(`Not enough credits for ${feature}.`);
      return false;
    }

    const previousCredits = userCredits;
    const optimisticCredits = Math.max(0, previousCredits - amount);
    setUserCredits(optimisticCredits);

    try {
      const response = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, feature, mode: "consume" }),
      });

      const result = (await response.json().catch(() => ({}))) as { error?: string; credits?: number; infinite?: boolean };
      if (typeof result.infinite === "boolean") {
        setIsInfiniteCredits(result.infinite);
      }

      if (!response.ok) {
        if (typeof result.credits === "number") {
          const latestCredits = Math.max(0, Math.floor(result.credits));
          setUserCredits(latestCredits);
          if (latestCredits < amount) {
            setCreditError(result.error || `Not enough credits for ${feature}.`);
            return false;
          }
        }

        if (response.status === 409) {
          setUserCredits(previousCredits);
          setCreditError(result.error || `Not enough credits for ${feature}.`);
          return false;
        }

        // Keep optimistic deduction when server temporarily fails to respond.
        setCreditError(null);
        return true;
      }

      if (typeof result.credits === "number") {
        setUserCredits(Math.max(0, Math.floor(result.credits)));
      }
      setCreditError(null);
      return true;
    } catch {
      // Keep optimistic deduction on transient network errors.
      setCreditError(null);
      return true;
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (isCreditsDepleted) {
      setCreditError("You have used up your credits. Top up in Marketplace to continue.");
      return;
    }

    const inferSourceRole = (name: string): SourceRole => {
      const lowerName = name.toLowerCase();
      if (/(mark\s*scheme|marking\s*scheme|rubric|grading)/.test(lowerName)) {
        return "marking-scheme";
      }
      if (/(model\s*answer|sample\s*answer)/.test(lowerName)) {
        return "model-answer";
      }
      if (/(notes|summary|guide|textbook)/.test(lowerName)) {
        return "notes";
      }
      return "question-paper";
    };

    if (acceptedFiles.length === 0) {
      return;
    }

    const requiredCredits = TOOL_CREDIT_COSTS.parsePdf * acceptedFiles.length;
    const allowed = await checkCreditsEnough(requiredCredits, "Upload + Parse PDF");
    if (!allowed) {
      return;
    }

    const requestParse = async (file: File) => {
      const payload = new FormData();
      payload.append("file", file);

      return new Promise<{
        status: number;
        result: {
          markdown?: string;
          warning?: string;
          error?: string;
          diagnostics?: ParseDiagnostics;
        };
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) {
            return;
          }
          const percent = Math.round((event.loaded / event.total) * 100);
          setParseStage("uploading");
          setParseProgress(Math.max(0, Math.min(100, percent)));
        };

        xhr.onreadystatechange = () => {
          if (xhr.readyState >= 2) {
            setParseStage("processing");
            setParseProgress(100);
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network error while uploading PDF."));
        };

        xhr.onload = () => {
          let parsedResult: { markdown?: string; warning?: string; error?: string; diagnostics?: ParseDiagnostics } = {};
          try {
            parsedResult = JSON.parse(xhr.responseText || "{}") as {
              markdown?: string;
              warning?: string;
              error?: string;
              diagnostics?: ParseDiagnostics;
            };
          } catch {
            parsedResult = {};
          }

          resolve({ status: xhr.status, result: parsedResult });
        };

        xhr.open("POST", "/api/parse");
        xhr.send(payload);
      });
    };

    setIsParsing(true);
    setParseProgress(0);
    setParseStage("uploading");

    let hadFailure = false;

    for (const file of acceptedFiles) {
      try {
        const { status, result } = await requestParse(file);

        if (status < 200 || status >= 300) {
          throw new Error(result.error || `Failed to parse ${file.name}.`);
        }

        setParseProgress(100);

        const extracted = result.markdown?.trim() || "";
        const parsedText = extracted || (result.warning ? `> OCR note\n\n${result.warning}` : "No text extracted from this PDF.");
        setParseDiagnostics(result.diagnostics ?? null);

        const newSource: SourceItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          role: inferSourceRole(file.name),
          text: parsedText,
          selected: true,
        };

        const pdfUrl = URL.createObjectURL(file);

        setSourceLibrary((previous) => [...previous, newSource]);
        setSourcePdfUrls((previous) => ({ ...previous, [newSource.id]: pdfUrl }));
        setSourceText(parsedText);
        await deductCredits(TOOL_CREDIT_COSTS.parsePdf, "Upload + Parse PDF");
      } catch (error) {
        hadFailure = true;
        const message = error instanceof Error ? error.message : "Unknown parsing error.";
        setSourceText(`> Parsing failed\n\n${message}`);
        setParseDiagnostics(null);
        setParseStage("failed");
        setParseProgress(0);
      }
    }

    setIsParsing(false);
    window.setTimeout(() => {
      if (!hadFailure) {
        setParseProgress(0);
      }
      setParseStage("idle");
    }, hadFailure ? 1600 : 900);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 20,
    disabled: isCreditsDepleted,
  });

  const getMessageText = (message: { parts: Array<{ type: string; text?: string }> }) =>
    message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n");

  const getWorkspaceDisplayText = (text: string, role: string) => {
    if (role !== "user") {
      return text;
    }

    const questionMatch = text.match(/User question:\s*([\s\S]*?)\n\nUploaded source context:/i);
    if (questionMatch?.[1]) {
      return questionMatch[1].trim();
    }

    return text;
  };

  const normalizeSourceReferenceTags = (text: string) => {
    // Convert plain square-bracket source references into inline code so markdown rendering
    // can style them as citation badges (for example: [Section B Q3], [Q1], [Source 2]).
    const cleaned = text
      // Remove accidental doubled backticks that can appear between adjacent citation tags.
      .replace(/`\s*`\s*(?=\[(Section|Q\s*\d|Question\s*\d|Source\s*\d|\d)[^\]]*\])/gi, " ")
      .replace(/``+/g, "`");

    return cleaned.replace(
      /(^|[^`])\[(Section[^\]]+|Q\s*\d+[^\]]*|Question\s*\d+[^\]]*|Source\s*\d+[^\]]*|\d+)\](?!`)/gi,
      (match, prefix, label) => `${prefix}\`[${label}]\``,
    );
  };

  const renderWorkspaceMarkdown = (text: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code(props) {
          const { className, children, ...rest } = props as {
            className?: string;
            children?: ReactNode;
          };

          const raw = String(children ?? "")
            .replace(/\n$/, "")
            .trim();
          const isInline = !className || !className.includes("language-");

          if (isInline && /^\[[^\]]+\]$/.test(raw) && raw.length <= 48) {
            return <span className="source-citation-chip">{raw}</span>;
          }

          return (
            <code className={className} {...rest}>
              {children}
            </code>
          );
        },
      }}
    >
      {normalizeSourceReferenceTags(text)}
    </ReactMarkdown>
  );

  const getSourceContext = () => {
    const selected = sourceLibrary.filter((item) => item.selected && item.text.trim());
    if (selected.length === 0) {
      return sourceText.trim().slice(0, 14000);
    }

    const merged = selected
      .map((item) => `### [${item.role.toUpperCase()}] ${item.name}\n${item.text.trim()}`)
      .join("\n\n");

    return merged.slice(0, 14000);
  };

  const getMarkingSchemeTemplateHint = () => {
    const markingSchemeText = sourceLibrary
      .filter((item) => item.selected && item.role === "marking-scheme")
      .map((item) => item.text)
      .join("\n\n");
    const source = (markingSchemeText || getSourceContext()).trim();
    if (!source) {
      return { hasTemplate: false, templateHint: "" };
    }

    const hasMarkingSchemeSignals = /(marking scheme|mark scheme|level\s*\d|ao\d|band\s*\d|indicative content)/i.test(
      source,
    );

    if (!hasMarkingSchemeSignals) {
      return { hasTemplate: false, templateHint: "" };
    }

    const templateLines = source
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line)
      .filter(
        (line) =>
          /^#{1,4}\s/.test(line) ||
          /^\|.+\|$/.test(line) ||
          /^(Level\s*\d+|Band\s*\d+|AO\d|Question\s*\d+|Q\d+)/i.test(line) ||
          /^[-*]\s+/.test(line),
      )
      .slice(0, 20)
      .join("\n");

    return { hasTemplate: true, templateHint: templateLines };
  };

  const getPastPaperTemplateHint = () => {
    const paperText = sourceLibrary
      .filter((item) => item.selected && item.role === "question-paper")
      .map((item) => item.text)
      .join("\n\n");
    const source = (paperText || getSourceContext()).trim();
    if (!source) {
      return { hasTemplate: false, templateHint: "" };
    }

    const templateSignals = /(section\s+[a-z]|question\s*\d+|q\d+|total\s*marks|duration|answer\s+all|attempt\s+any|instructions)/i;
    if (!templateSignals.test(source)) {
      return { hasTemplate: false, templateHint: "" };
    }

    const templateLines = source
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line)
      .filter(
        (line) =>
          /^#{1,4}\s/.test(line) ||
          /^section\s+[a-z0-9]/i.test(line) ||
          /^(question\s*\d+|q\d+)/i.test(line) ||
          /^(time allowed|duration|total marks|instructions)/i.test(line) ||
          /^[-*]\s+/.test(line),
      )
      .slice(0, 40)
      .join("\n");

    return { hasTemplate: true, templateHint: templateLines };
  };

  const getMockPaperPages = (content: string) => {
    const parts = content
      .split(/\n\s*\[\[PAGE_BREAK\]\]\s*\n/gi)
      .map((part) => part.trim())
      .filter(Boolean);

    return parts.length > 0 ? parts : [content.trim()];
  };

  const exportTextOutput = (content: string, format: "doc" | "pdf", fileNameBase: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      return false;
    }

    const safeBody = trimmed
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${fileNameBase}</title></head><body><h2>${fileNameBase}</h2><div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;white-space:normal;">${safeBody}</div></body></html>`;

    if (format === "doc") {
      const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileNameBase.toLowerCase().replace(/\s+/g, "-")}.doc`;
      link.click();
      URL.revokeObjectURL(url);
      return true;
    }

    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!printWindow) {
      return false;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    return true;
  };

  const buildMockPaperPreviewExportHtml = (fileNameBase: string) => {
    const previewRoot = mockPaperPreviewRef.current;
    const renderedPages = previewRoot ? Array.from(previewRoot.querySelectorAll<HTMLElement>(".mock-paper-preview-page")) : [];
    if (renderedPages.length === 0) {
      return null;
    }

    const pagesHtml = renderedPages.map((page) => page.outerHTML).join("\n");
    const headStyles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
      .map((node) => node.outerHTML)
      .join("\n");

    return `<!doctype html><html><head><meta charset="utf-8" /><base href="${window.location.origin}/" /><title>${fileNameBase}</title>${headStyles}<style>
      @page { size: A4 portrait; margin: 10mm; }
      body { margin: 0; background: #eef2f7; }
      .export-wrap { max-width: 860px; margin: 18px auto; padding: 0 8px 18px; }
      .mock-paper-preview-page { box-sizing: border-box; width: ${MOCK_PAPER_A4_WIDTH_PX}px; max-width: ${MOCK_PAPER_A4_WIDTH_PX}px; height: ${MOCK_PAPER_A4_HEIGHT_PX}px; min-height: ${MOCK_PAPER_A4_HEIGHT_PX}px; aspect-ratio: 210 / 297; page-break-after: always; overflow: hidden; }
      .mock-paper-preview-page:last-child { page-break-after: auto; }
      @media print {
        body { background: #fff; }
        .export-wrap { max-width: none; margin: 0; padding: 0; }
      }
    </style></head><body><main class="export-wrap">${pagesHtml}</main></body></html>`;
  };

  const exportMockPaperOutput = (format: "doc" | "pdf") => {
    const content = answerKeyOutput.trim();
    if (!content) {
      setAnswerKeyError("No generated mock paper to export.");
      return;
    }

    const fileNameBase = "Generated Mock Paper";
    const previewHtml = buildMockPaperPreviewExportHtml(fileNameBase);
    let ok = false;

    if (previewHtml) {
      if (format === "doc") {
        const blob = new Blob([previewHtml], { type: "application/msword;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileNameBase.toLowerCase().replace(/\s+/g, "-")}.doc`;
        link.click();
        URL.revokeObjectURL(url);
        ok = true;
      } else {
        const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(previewHtml);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
          ok = true;
        }
      }
    } else {
      setAnswerKeyError("Preview is not ready yet. Generate the paper first, then export.");
      return;
    }

    if (!ok) {
      setAnswerKeyError("Popup blocked. Please allow popups to export PDF.");
    }
  };

  const exportGradingOutput = (format: "doc" | "pdf") => {
    const content = (gradingFeedbackDraft || latestAssistantFeedback).trim();
    if (!content) {
      return;
    }

    exportTextOutput(content, format, "Grading Feedback");
  };

  const exportMarkingRulesOutput = (format: "doc" | "pdf") => {
    const content = (markingRulesDraft || markingRulesData?.rawResponse || "").trim();
    if (!content) {
      return;
    }

    exportTextOutput(content, format, "Marking Rules");
  };

  const exportTopicPredictorOutput = (format: "doc" | "pdf") => {
    const content = (topicPredictorDraft || topicPredictorData?.rawResponse || "").trim();
    if (!content) {
      return;
    }

    exportTextOutput(content, format, "Topic Predictor");
  };

  const requireSource = (channel: "workspace" | "grading") => {
    if (getSourceContext()) {
      return true;
    }

    const noSourceMessage =
      "No parsed source material is loaded yet. Please upload and parse a past-paper PDF first, then run this tool again.";
    if (channel === "workspace") {
      sendWorkspaceMessage({ text: noSourceMessage });
    } else {
      sendGradingMessage({ text: noSourceMessage });
    }
    return false;
  };

  const generateMockPaper = async (difficultyOverride?: "balanced" | "exam-hard" | "mostly-medium") => {
    if (isCreditsDepleted) {
      setCreditError("You have used up your credits. Top up in Marketplace to continue.");
      return;
    }

    if (!requireSource("workspace") || answerKeyLoading) {
      return;
    }

    const allowed = await checkCreditsEnough(TOOL_CREDIT_COSTS.generateMockPaper, "Generate Mock Paper");
    if (!allowed) {
      return;
    }

    const selectedDifficulty = difficultyOverride ?? mockPaperDifficulty;
    if (difficultyOverride && difficultyOverride !== mockPaperDifficulty) {
      setMockPaperDifficulty(difficultyOverride);
    }

    setActiveTool("answer-key");
    setAnswerKeyLoading(true);
    setAnswerKeyError(null);
    setMockPaperNotice(null);
    setMockPaperChatError(null);
    setMockPaperGenerationStage("analyzing");

    const stageTimers: number[] = [];
    stageTimers.push(window.setTimeout(() => setMockPaperGenerationStage("template"), 700));
    stageTimers.push(window.setTimeout(() => setMockPaperGenerationStage("drafting"), 1500));
    stageTimers.push(window.setTimeout(() => setMockPaperGenerationStage("markscheme"), 2300));
    stageTimers.push(window.setTimeout(() => setMockPaperGenerationStage("formatting"), 3200));

    const hasTopicPredictor = topicPredictorData?.predictions?.length || topicPredictorDraft.trim();
    if (!hasTopicPredictor) {
      setMockPaperNotice("Tip: Run Topic Predictor first for higher-quality paper targeting. Continuing with current sources.");
    }

    const difficultyLabel =
      selectedDifficulty === "exam-hard"
        ? "Mostly exam-hard"
        : selectedDifficulty === "mostly-medium"
          ? "Mostly medium"
          : "Balanced (easy / medium / hard)";

    const topicContext = topicPredictorData?.predictions?.length
      ? topicPredictorData.predictions
          .map((prediction, index) => `${index + 1}. ${prediction.topic} (${prediction.confidence}) - ${prediction.evidence}`)
          .join("\n")
      : topicPredictorDraft.trim() || "Not available. Ask user to run Topic Predictor for improved targeting.";

    const { hasTemplate, templateHint } = getPastPaperTemplateHint();

    const prompt = `
You are an examiner creating a printable mock exam paper from uploaded sources.

Task:
- Analyze uploaded past papers and all selected sources to infer exam style, question patterns, wording, and mark allocation.
- Follow the uploaded past paper template as strictly as possible, including section naming, ordering, numbering style, instruction tone, and marks formatting.
- Difficulty mix for this generation: ${difficultyLabel}.
- If topic predictions are available, prioritize them while preserving realism.

${
  hasTemplate
    ? `Template cues from uploaded past paper (must mirror closely):\n${templateHint}`
    : "Template cues: no clear template extracted. Use standard exam-paper format with clear sections and marks."
}

Output requirements (printable template):
1. **Mock Paper Cover**
   - Exam title, subject, duration, total marks, candidate instructions.
2. **Section A (short/objective)**
   - Numbered questions with marks each.
3. **Section B (structured/source questions)**
   - Numbered questions with subparts and marks.
4. **Section C (essay/long response)**
   - 1-2 higher-order questions with marks.
5. **Mark Scheme Appendix**
   - Concise mark guidance per question/subpart.
6. **Print Layout Rules**
   - Clean spacing, page-break friendly headings, and answer lines where suitable.

Formatting rules:
- Return markdown only.
- Keep headings clear and printable.
- Use realistic exam wording and mark distribution.
- Do not include meta commentary.
- Preserve punctuation symbols, numbering symbols, and separators reflected in the uploaded template.
- Insert page separators using exactly: [[PAGE_BREAK]] between pages.
- Keep each page length balanced for print readability.

Source document markdown:
${getSourceContext()}

Topic predictor context:
${topicContext}
`.trim();

    try {
      const responseText = await requestToolOutput(prompt);
      setAnswerKeyOutput(responseText || "No mock paper generated.");
      setIsEditingAnswerKeyOutput(false);
      setMockPaperGenerationStage("done");
      const charged = await deductCredits(TOOL_CREDIT_COSTS.generateMockPaper, "Generate Mock Paper");
      if (!charged) {
        setMockPaperNotice("Generation completed, but credit deduction failed. Please refresh and try again.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate mock paper.";
      setAnswerKeyError(message);
      setMockPaperGenerationStage("idle");
    } finally {
      stageTimers.forEach((timerId) => window.clearTimeout(timerId));
      window.setTimeout(() => {
        setMockPaperGenerationStage("idle");
      }, 900);
      setAnswerKeyLoading(false);
    }
  };

  const applyMockPaperInstruction = async (instruction: string, fromQueue = false) => {
    if (isCreditsDepleted) {
      setCreditError("You have used up your credits. Top up in Marketplace to continue.");
      setMockPaperChatError("You have used up your credits. Go to Marketplace to top up.");
      return;
    }

    if (!instruction.trim() || mockPaperChatLoading) {
      return;
    }

    if (!answerKeyOutput.trim()) {
      setMockPaperChatError("Generate a mock paper first, then request edits here.");
      return;
    }

    const allowed = await checkCreditsEnough(TOOL_CREDIT_COSTS.mockEdit, "AI Mock Edit");
    if (!allowed) {
      setMockPaperChatError("Not enough credits for AI Mock Edit.");
      return;
    }

    setMockPaperChatError(null);
    setMockPaperChatLoading(true);
    setMockPaperChatMessages((previous) => [
      ...previous,
      { role: "user", text: fromQueue ? `${instruction} (queued)` : instruction },
    ]);

    const { hasTemplate, templateHint } = getPastPaperTemplateHint();

    const prompt = `
You are editing an existing mock exam paper.

Goal:
- Apply the user's modification request to the mock paper.
- Preserve printable exam structure and keep mark scheme appendix present.
- Keep alignment with uploaded past paper template.
- Preserve punctuation symbols and visual separators used in the current draft/template.
- Keep page boundaries with [[PAGE_BREAK]] markers.

${
  hasTemplate
    ? `Template cues from uploaded past paper (must mirror closely):\n${templateHint}`
    : "Template cues unavailable. Preserve current paper structure and formatting."
}

User edit request:
${instruction}

Current mock paper draft:
${answerKeyOutput}

Source context:
${getSourceContext()}

Return ONLY the full updated mock paper in markdown.
`.trim();

    try {
      const updatedPaper = await requestToolOutput(prompt);
      setAnswerKeyOutput(updatedPaper || answerKeyOutput);
      setMockPaperChatMessages((previous) => [...previous, { role: "assistant", text: "Applied. Mock paper updated." }]);
      const charged = await deductCredits(TOOL_CREDIT_COSTS.mockEdit, "AI Mock Edit");
      if (!charged) {
        setMockPaperChatError("Edit applied, but credit deduction failed. Please refresh and check balance.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply mock paper edit.";
      setMockPaperChatError(message);
      setMockPaperChatMessages((previous) => [...previous, { role: "assistant", text: "I could not apply that edit. Please try rephrasing." }]);
    } finally {
      setMockPaperChatLoading(false);
    }
  };

  const applyMockPaperEdit = async () => {
    const instruction = mockPaperChatInput.trim();
    if (!instruction) {
      return;
    }

    setMockPaperChatInput("");

    if (answerKeyLoading) {
      setMockPaperEditQueue((previous) => [...previous, instruction]);
      setMockPaperChatMessages((previous) => [
        ...previous,
        { role: "assistant", text: "Queued. I will apply this edit right after generation finishes." },
      ]);
      return;
    }

    await applyMockPaperInstruction(instruction);
  };

  const openMockPaperWindow = () => {
    openWindow("answer-key");
  };

  const runExtractDbqs = async () => {
    if (isCreditsDepleted) {
      setCreditError("You have used up your credits. Top up in Marketplace to continue.");
      return;
    }

    if (!requireSource("workspace") || workspaceIsLoading) {
      return;
    }

    const charged = await deductCredits(TOOL_CREDIT_COSTS.extractDbq, "Extract DBQs / Sources");
    if (!charged) {
      return;
    }

    setActiveTool("extract-dbq");
    const prompt = `
You are analyzing a history exam paper.

  Learner profile:
  ${buildLearnerProfileContext()}

Task:
- Extract only DBQ/source-based questions, maps, and cartoon analysis prompts.
- Ignore unrelated sections and administrative text.
- Group results by section and preserve original numbering when visible.

Output format:
- Section heading
- Bullet list of extracted DBQ/source prompts
- Short "Skill Focus" tag for each item (e.g., inference, reliability, comparison, provenance)

Source document markdown:
${getSourceContext()}
`.trim();

    sendWorkspaceMessage({ text: prompt });
  };

  const runGradeAnswer = async () => {
    if (isCreditsDepleted) {
      setCreditError("You have used up your credits. Top up in Marketplace to continue.");
      return;
    }

    if (!requireSource("grading") || gradingIsLoading) {
      return;
    }

    const answer = gradingAnswer.trim();
    if (!answer) {
      return;
    }

    const charged = await deductCredits(TOOL_CREDIT_COSTS.gradeAnswer, "Grade My Answer");
    if (!charged) {
      return;
    }

    setActiveTool("grade-answer");
    const prompt = `
You are an exam marker.

  Learner profile:
  ${buildLearnerProfileContext()}

Task:
- Grade the student's answer against the most relevant question from the source material.
- Award a mark out of 4 by default unless the source shows a different mark value.
- Give precise feedback on missing evidence, source reference quality, and structure.
- Keep wording short, clear, and specific. Remove filler.
- Use markdown emphasis and symbols where helpful (e.g., **key point**, - bullet).

Student answer:
"""
${answer}
"""

Output format:
1. **Score:** x / total
2. **What was done well** (2-3 bullets)
3. **What lost marks** (2-3 bullets)
4. **Improved model answer** (short)
5. Keep total response under 170 words unless user requests more.

Source document markdown:
${getSourceContext()}
`.trim();

    sendGradingMessage({ text: prompt });
  };

  const extractJsonPayload = (text: string) => {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const objectMatch = text.match(/\{[\s\S]*\}/);
    return objectMatch?.[0]?.trim() ?? text;
  };

  const normalizeMarkingRules = (raw: string): MarkingRulesData => {
    const jsonCandidate = extractJsonPayload(raw);

    try {
      const parsed = JSON.parse(jsonCandidate) as {
        commandWords?: Array<{ word?: string; requirement?: string }>;
        markBands?: Array<{ level?: string; marks?: string; criteria?: string }>;
        checklist?: string[];
      };

      const commandWords = (parsed.commandWords ?? [])
        .filter((item) => item.word && item.requirement)
        .map((item) => ({ word: item.word!.trim(), requirement: item.requirement!.trim() }));

      const markBands = (parsed.markBands ?? [])
        .filter((item) => item.level && item.marks && item.criteria)
        .map((item) => ({
          level: item.level!.trim(),
          marks: item.marks!.trim(),
          criteria: item.criteria!.trim(),
        }));

      const checklist = (parsed.checklist ?? []).map((item) => item.trim()).filter(Boolean);

      return {
        commandWords,
        markBands,
        checklist,
        rawResponse: raw,
      };
    } catch {
      const commandWords: CommandWordRule[] = [];
      const markBands: MarkBandRule[] = [];
      const checklist: string[] = [];

      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        const commandMatch = trimmed.match(/^[-*]\s*\*\*(.+?)\*\*\s*[:\-]\s*(.+)$/);
        if (commandMatch) {
          commandWords.push({ word: commandMatch[1].trim(), requirement: commandMatch[2].trim() });
          continue;
        }

        const bandMatch = trimmed.match(/^(?:[-*]\s*)?(Level\s*\d+)\s*\(([^)]+)\)\s*[:\-]\s*(.+)$/i);
        if (bandMatch) {
          markBands.push({ level: bandMatch[1].trim(), marks: bandMatch[2].trim(), criteria: bandMatch[3].trim() });
          continue;
        }

        const checklistMatch = trimmed.match(/^[-*]\s+(.+)$/);
        if (checklistMatch) {
          checklist.push(checklistMatch[1].trim());
        }
      }

      return {
        commandWords,
        markBands,
        checklist,
        rawResponse: raw,
      };
    }
  };

  const normalizeTopicPredictor = (raw: string): TopicPredictorData => {
    const jsonCandidate = extractJsonPayload(raw);

    try {
      const parsed = JSON.parse(jsonCandidate) as {
        predictions?: Array<{ topic?: string; confidence?: string; evidence?: string }>;
      };

      const predictions = (parsed.predictions ?? [])
        .filter((item) => item.topic && item.confidence && item.evidence)
        .map((item) => {
          const confidenceRaw = (item.confidence || "Medium").trim().toLowerCase();
          const confidence: TopicPrediction["confidence"] =
            confidenceRaw === "high" ? "High" : confidenceRaw === "low" ? "Low" : "Medium";

          return {
            topic: item.topic!.trim(),
            confidence,
            evidence: item.evidence!.trim(),
          };
        });

      return { predictions, rawResponse: raw };
    } catch {
      const predictions: TopicPrediction[] = [];

      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        const match = trimmed.match(/^[-*]\s*\*\*(.+?)\*\*\s*\((High|Medium|Low)\)\s*[:\-]\s*(.+)$/i);
        if (match) {
          predictions.push({
            topic: match[1].trim(),
            confidence: (match[2][0].toUpperCase() + match[2].slice(1).toLowerCase()) as TopicPrediction["confidence"],
            evidence: match[3].trim(),
          });
        }
      }

      return { predictions, rawResponse: raw };
    }
  };

  const requestToolOutput = async (prompt: string) => {
    const personalizedPrompt = `
Learner profile:
${buildLearnerProfileContext()}

Task prompt:
${prompt}
`.trim();

    const response = await fetch("/api/chat-panel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            id: `tool-${Date.now()}`,
            role: "user",
            parts: [{ type: "text", text: personalizedPrompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to contact Exam AI.");
    }

    if (!response.body) {
      throw new Error("No response stream available.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let output = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }

        const payload = trimmed.replace(/^data:\s*/, "");
        if (!payload || payload === "[DONE]") {
          continue;
        }

        try {
          const event = JSON.parse(payload) as { type?: string; delta?: string; errorText?: string };
          if (event.type === "text-delta" && event.delta) {
            output += event.delta;
          }
          if (event.type === "error") {
            throw new Error(event.errorText || "Tool generation failed.");
          }
        } catch {
          // Ignore non-JSON event lines.
        }
      }
    }

    return output.trim();
  };

  const generateMarkingRules = async () => {
    if (isCreditsDepleted) {
      setCreditError("You have used up your credits. Top up in Marketplace to continue.");
      return;
    }

    if (!requireSource("workspace") || markingRulesLoading) {
      return;
    }

    const allowed = await checkCreditsEnough(TOOL_CREDIT_COSTS.markingRules, "Marking Rules");
    if (!allowed) {
      return;
    }

    setActiveTool("marking-rules");
    setMarkingRulesLoading(true);
    setMarkingRulesError(null);

    const prompt = `
Act as a strict senior examiner for the provided past paper. Extract the specific 'command words' used in the questions (e.g., analyze, explain, to what extent) and define exactly what is required to satisfy them. Then, outline the general marking bands (Level 1, Level 2, Level 3) and provide a strict checklist of what a student must include to achieve maximum marks.

Return ONLY valid JSON with this shape:
{
  "commandWords": [{ "word": "", "requirement": "" }],
  "markBands": [{ "level": "", "marks": "", "criteria": "" }],
  "checklist": ["..."]
}

Source document markdown:
${getSourceContext()}
`.trim();

    try {
      const responseText = await requestToolOutput(prompt);
      const parsed = normalizeMarkingRules(responseText);
      setMarkingRulesData(parsed);
      setMarkingRulesDraft(parsed.rawResponse);
      setIsEditingMarkingRulesDraft(false);
      await deductCredits(TOOL_CREDIT_COSTS.markingRules, "Marking Rules");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate marking rules.";
      setMarkingRulesError(message);
    } finally {
      setMarkingRulesLoading(false);
    }
  };

  const generateTopicPredictions = async () => {
    if (isCreditsDepleted) {
      setCreditError("You have used up your credits. Top up in Marketplace to continue.");
      return;
    }

    if (!requireSource("workspace") || topicPredictorLoading) {
      return;
    }

    const allowed = await checkCreditsEnough(TOOL_CREDIT_COSTS.topicPredictor, "Topic Predictor");
    if (!allowed) {
      return;
    }

    setActiveTool("topic-predictor");
    setTopicPredictorLoading(true);
    setTopicPredictorError(null);

    const prompt = `
Act as a master curriculum forecaster for history exams. Analyze the specific topics heavily tested in the provided past paper. Based on standard syllabus patterns, identify major related concepts that were NOT tested in this paper and are highly likely to appear next. Output a strictly formatted JSON object containing an array called 'predictions'. Each item in the array must have: 'topic' (string), 'confidence' (string: High, Medium, or Low), and 'evidence' (string: 1-2 sentences explaining why this topic is due). Respond ONLY with the raw JSON object.

Source document markdown:
${getSourceContext()}
`.trim();

    try {
      const responseText = await requestToolOutput(prompt);
      const parsed = normalizeTopicPredictor(responseText);
      setTopicPredictorData(parsed);
      setTopicPredictorDraft(parsed.rawResponse);
      setIsEditingTopicPredictorDraft(false);
      await deductCredits(TOOL_CREDIT_COSTS.topicPredictor, "Topic Predictor");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate topic predictions.";
      setTopicPredictorError(message);
    } finally {
      setTopicPredictorLoading(false);
    }
  };

  const openWindow = (id: WindowId) => {
    if (isCreditsDepleted && WINDOW_TOOL_CREDIT_COSTS[id] > 0) {
      setCreditError("You have used up your credits. Top up in Marketplace to continue.");
      return;
    }

    setActiveTool(id);
    dispatchDesktop({ type: "OPEN_WINDOW", id });
    dispatchDesktop({ type: "FOCUS_WINDOW", id });
  };

  const closeWindow = (id: WindowId) => {
    if (id === "timed-section") {
      setTimerRunning(false);
    }

    dispatchDesktop({ type: "CLOSE_WINDOW", id });
  };

  const openTimedWindow = () => {
    openWindow("timed-section");
  };

  const startTimedSession = () => {
    const totalSeconds = Math.max(1, timedMinutes) * 60;
    setSecondsLeft(totalSeconds);
    setTimerRunning(true);
    openWindow("timed-section");
  };

  const resetTimedSession = () => {
    setTimerRunning(false);
    setSecondsLeft(Math.max(1, timedMinutes) * 60);
  };

  const animateCoverExit = (onComplete?: () => void) => {
    setCoverTransitioning(true);
    window.scrollTo({ top: 120, behavior: "smooth" });
    window.setTimeout(() => {
      setShowCoverPage(false);
      setCoverTransitioning(false);
      onComplete?.();
    }, 430);
  };

  const enterDesktop = () => {
    animateCoverExit();
  };

  const startFocusSprintFromCover = () => {
    setTimedMinutes(15);
    setSecondsLeft(15 * 60);
    animateCoverExit(() => {
      setActiveView("workspace");
      openWindow("timed-section");
      setTimerRunning(true);
    });
  };

  const openEditField = (field: CoverEditableField) => {
    setEditingFields((previous) => ({ ...previous, [field]: true }));
  };

  const closeEditField = (field: CoverEditableField) => {
    setEditingFields((previous) => ({ ...previous, [field]: false }));
  };

  const toggleTimer = () => {
    if (secondsLeft <= 0) {
      return;
    }
    setTimerRunning((running) => !running);
  };

  const formatClock = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = Math.max(0, totalSeconds % 60)
      .toString()
      .padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const timerWindow = desktopState.windows["timed-section"];

  useEffect(() => {
    if (!timerRunning || !timerWindow.isOpen || timerWindow.isMinimized) {
      return;
    }

    const timerId = setInterval(() => {
      setSecondsLeft((previous) => {
        if (previous <= 1) {
          clearInterval(timerId);
          setTimerRunning(false);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [timerRunning, timerWindow.isOpen, timerWindow.isMinimized]);

  useEffect(() => {
    if (!timerRunning) {
      setSecondsLeft(Math.max(1, timedMinutes) * 60);
    }
  }, [timedMinutes, timerRunning]);

  useEffect(() => {
    if (!showCoverPage) {
      return;
    }

    const motivationId = setInterval(() => {
      setMotivationIndex((index) => (index + 1) % motivationLines.length);
    }, 10000);

    return () => clearInterval(motivationId);
  }, [showCoverPage, motivationLines.length]);

  useEffect(() => {
    if (!showCoverPage) {
      return;
    }

    const clockId = setInterval(() => {
      setClockNow(new Date());
    }, 1000);

    return () => clearInterval(clockId);
  }, [showCoverPage]);

  useEffect(() => {
    if (!showStartupSplash) {
      return;
    }

    const expandId = window.setTimeout(() => setSplashStage("expand"), 760);
    const exitId = window.setTimeout(() => setSplashStage("exit"), 1560);
    const finishId = window.setTimeout(() => setShowStartupSplash(false), 2280);

    return () => {
      window.clearTimeout(expandId);
      window.clearTimeout(exitId);
      window.clearTimeout(finishId);
    };
  }, [showStartupSplash]);

  const clearFile = () => {
    Object.values(sourcePdfUrls).forEach((url) => {
      URL.revokeObjectURL(url);
    });
    setSourceText("");
    setSourceLibrary([]);
    setSourcePdfUrls({});
    setActiveSourceId(null);
    setParseDiagnostics(null);
    setIsParsing(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreditsDepleted) {
      setCreditError("You have used up your credits. Top up in Marketplace to continue.");
      return;
    }

    const prompt = input.trim();

    if (!prompt || workspaceIsLoading || !requireSource("workspace")) {
      return;
    }

    const charged = await deductCredits(TOOL_CREDIT_COSTS.examChat, "Exam AI Chat");
    if (!charged) {
      return;
    }

    const groundedPrompt = `
Use only the uploaded source context below to answer.
- If information is not present, say: "Not found in uploaded source."
- Do not use outside facts.
- Cite section/question labels from the source when possible.
- Provide a detailed and structured response in this exact order:
  1) Direct Answer
  2) Source Evidence
  3) Key Details
  4) In Short
- Write each section label as a standalone bold line (example: **Direct Answer**).
- In Source Evidence, use source tags in square brackets with labels (for example: [Section B Q3], [Section E Q1]).
- Place source tags at the end of the supporting sentence so they do not interrupt reading flow.
- Each source tag must map to a specific source section/question label from uploaded content.
- Do not output stray markdown backticks around source tags.
- Do not attach source tags to plain words that are not source labels.
- In Key Details, prefer bullet labels such as Immediate Cause, Core Objective, Impact, Significance.
- Keep wording exam-ready, clear, and specific.

  Learner profile:
  ${buildLearnerProfileContext()}

User question:
${prompt}

Uploaded source context:
${getSourceContext()}
`.trim();

    sendWorkspaceMessage({ text: groundedPrompt });
    setInput("");
  };

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = authEmailInput.trim().toLowerCase();
    const password = authPasswordInput;
    const name = authNameInput.trim() || email.split("@")[0] || "Scholar";

    if (!email || !email.includes("@")) {
      setAuthError("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }

    setAuthError(null);

    if (authMode === "signup") {
      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!registerResponse.ok) {
        const result = (await registerResponse.json().catch(() => ({}))) as { error?: string };
        setAuthError(result.error || "Failed to create account.");
        return;
      }
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setAuthError("Invalid email or password.");
      return;
    }

    setLearnerName(name);
    setAuthPasswordInput("");
  };

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    setAuthNameInput("");
    setAuthEmailInput("");
    setAuthPasswordInput("");
    setAuthError(null);
    setShowCoverPage(true);
    setShowStartupSplash(true);
  };

  const handleExitToCover = () => {
    setActiveView("workspace");
    setShowCoverPage(true);
    setCoverTransitioning(false);
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    await signIn("google", { callbackUrl: "/" });
  };

  const studioTools = [
    {
      id: "answer-key",
      label: "Generate Mock Paper",
      desc: "Create a printable mock paper from past papers and sources.",
      icon: KeyRound,
      tone: "text-orange-600 bg-orange-50",
      onClick: openMockPaperWindow,
    },
    {
      id: "grade-answer",
      label: "Grade My Answer",
      desc: "Mark your response and explain dropped points.",
      icon: PencilLine,
      tone: "text-blue-600 bg-blue-50",
      onClick: () => openWindow("grade-answer"),
    },
    {
      id: "extract-dbq",
      label: "Extract DBQs / Sources",
      desc: "Pull source-based questions only.",
      icon: ListFilter,
      tone: "text-emerald-600 bg-emerald-50",
      onClick: runExtractDbqs,
    },
    {
      id: "topic-predictor",
      label: "Topic Predictor",
      desc: "Forecast likely next-paper topics.",
      icon: TrendingUp,
      tone: "text-violet-600 bg-violet-50",
      onClick: () => openWindow("topic-predictor"),
    },
    {
      id: "marking-rules",
      label: "Marking Rules",
      desc: "Explain scoring logic for source questions.",
      icon: ShieldCheck,
      tone: "text-cyan-600 bg-cyan-50",
      onClick: () => openWindow("marking-rules"),
    },
    {
      id: "timed-section",
      label: "Timed Section",
      desc: "Start a timed answer-writing sprint.",
      icon: Timer,
      tone: "text-rose-600 bg-rose-50",
      onClick: openTimedWindow,
    },
  ];

  const latestAssistantMessage = [...gradingMessages].reverse().find((message) => message.role === "assistant");
  const latestAssistantFeedback = latestAssistantMessage ? getMessageText(latestAssistantMessage) : "";
  const latestWorkspaceAssistantMessage = [...workspaceMessages].reverse().find((message) => message.role === "assistant");
  const latestWorkspaceAssistantId = [...workspaceMessages].reverse().find((message) => message.role === "assistant")?.id;
  const latestWorkspaceAssistantText = latestWorkspaceAssistantMessage ? getMessageText(latestWorkspaceAssistantMessage) : "";
  const scoreSourceText = (gradingFeedbackDraft || latestAssistantFeedback).trim();
  const scoreMatch = scoreSourceText.match(/(\d+)\s*\/\s*(\d+)/);
  const FREE_TRIAL_CREDIT_LIMIT = 20;
  const cappedCredits = isInfiniteCredits
    ? FREE_TRIAL_CREDIT_LIMIT
    : Math.max(0, Math.min(userCredits, FREE_TRIAL_CREDIT_LIMIT));
  const creditBarPercent = (cappedCredits / FREE_TRIAL_CREDIT_LIMIT) * 100;
  const previewScale = Math.max(0.5, Math.min(1.25, mockPaperPreviewZoom / 100));

  const teleportToMarketplace = () => {
    setShowCoverPage(false);
    setActiveView("purchase");
    setMarketplacePanel("store");
  };

  useEffect(() => {
    if (latestWorkspaceAssistantId === lastAnimatedAssistantId.current) {
      return;
    }

    lastAnimatedAssistantId.current = latestWorkspaceAssistantId ?? null;
    setAnimatedWorkspaceText("");
  }, [latestWorkspaceAssistantId]);

  useEffect(() => {
    if (!isCreditsDepleted && creditError?.toLowerCase().includes("used up your credits")) {
      setCreditError(null);
    }
  }, [isCreditsDepleted, creditError]);

  useEffect(() => {
    if (workspaceStatus === "streaming") {
      return;
    }

    setAnimatedWorkspaceText(latestWorkspaceAssistantText);
  }, [workspaceStatus, latestWorkspaceAssistantText]);

  useEffect(() => {
    if (workspaceStatus !== "streaming" || !latestWorkspaceAssistantId) {
      return;
    }

    const timer = window.setInterval(() => {
      setAnimatedWorkspaceText((current) => {
        const target = latestWorkspaceAssistantText;
        if (current.length >= target.length) {
          return current;
        }

        const remaining = target.length - current.length;
        const step = remaining > 260 ? 4 : remaining > 140 ? 3 : remaining > 60 ? 2 : 1;
        return target.slice(0, current.length + step);
      });
    }, 24);

    return () => window.clearInterval(timer);
  }, [workspaceStatus, latestWorkspaceAssistantId, latestWorkspaceAssistantText]);

  useEffect(() => {
    if (isEditingGradingFeedback) {
      return;
    }

    setGradingFeedbackDraft(latestAssistantFeedback);
  }, [latestAssistantFeedback, isEditingGradingFeedback]);

  useEffect(() => {
    if (isEditingMarkingRulesDraft) {
      return;
    }

    setMarkingRulesDraft(markingRulesData?.rawResponse ?? "");
  }, [markingRulesData, isEditingMarkingRulesDraft]);

  useEffect(() => {
    if (isEditingTopicPredictorDraft) {
      return;
    }

    setTopicPredictorDraft(topicPredictorData?.rawResponse ?? "");
  }, [topicPredictorData, isEditingTopicPredictorDraft]);

  const confidenceBadgeClass = (confidence: TopicPrediction["confidence"]) => {
    if (confidence === "High") {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (confidence === "Low") {
      return "bg-rose-50 text-rose-700 border-rose-200";
    }
    return "bg-amber-50 text-amber-700 border-amber-200";
  };

  const windowMeta: Record<WindowId, { label: string; icon: typeof Timer }> = {
    "answer-key": { label: "Mock Paper", icon: KeyRound },
    "grade-answer": { label: "Grade", icon: PencilLine },
    "marking-rules": { label: "Rules", icon: ShieldCheck },
    "topic-predictor": { label: "Predictor", icon: TrendingUp },
    "timed-section": { label: "Timer", icon: Timer },
  };

  const vaultItems = sourceLibrary.map((item) => ({
    title: item.name,
    subject:
      item.role === "question-paper"
        ? "Question"
        : item.role === "marking-scheme"
          ? "Mark Scheme"
          : item.role === "model-answer"
            ? "Model"
            : "Notes",
    completion: item.text.trim() ? 100 : 0,
    status: item.selected ? "Active" : "Saved",
  }));

  const navClass = (view: AppView) =>
    `rounded-xl p-2 transition-all ${
      activeView === view
        ? "bg-indigo-50 text-indigo-600 shadow-sm"
        : "text-slate-400 hover:bg-slate-50 hover:text-slate-700"
    }`;

  const sourceRoleLabel: Record<SourceRole, string> = {
    "question-paper": "Question",
    "marking-scheme": "Mark Scheme",
    "model-answer": "Model",
    notes: "Notes",
  };

  const activeSource = sourceLibrary.find((item) => item.id === activeSourceId) ?? null;
  const templatePreviewSource =
    sourceLibrary.find((item) => item.selected && item.role === "question-paper" && sourcePdfUrls[item.id]) ??
    sourceLibrary.find((item) => item.role === "question-paper" && sourcePdfUrls[item.id]) ??
    null;
  const templatePreviewPdfUrl = templatePreviewSource ? sourcePdfUrls[templatePreviewSource.id] : null;

  const setSourceSelected = (id: string, selected: boolean) => {
    setSourceLibrary((previous) => previous.map((item) => (item.id === id ? { ...item, selected } : item)));
  };

  const setSourceRole = (id: string, role: SourceRole) => {
    setSourceLibrary((previous) => previous.map((item) => (item.id === id ? { ...item, role } : item)));
  };

  const relinkSourcePdf = (id: string, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    if (file.type !== "application/pdf") {
      setMockPaperNotice("Please select a PDF file when re-linking template underlay.");
      return;
    }

    const existingUrl = sourcePdfUrls[id];
    if (existingUrl) {
      URL.revokeObjectURL(existingUrl);
    }

    const nextUrl = URL.createObjectURL(file);
    setSourcePdfUrls((previous) => ({
      ...previous,
      [id]: nextUrl,
    }));
    setMockPaperNotice("Template PDF re-linked for underlay preview.");
  };

  const removeSource = (id: string) => {
    const removedPdfUrl = sourcePdfUrls[id];
    if (removedPdfUrl) {
      URL.revokeObjectURL(removedPdfUrl);
      setSourcePdfUrls((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
    }

    setSourceLibrary((previous) => {
      const next = previous.filter((item) => item.id !== id);
      if (activeSourceId === id) {
        setActiveSourceId(null);
      }
      return next;
    });
  };

  const renderWorkspaceView = () => {
    const showMainShell = !isCompactWorkspace || isDualPaneCompact || workspaceCompactPane !== "engine";
    const showSourcePane = !isCompactWorkspace || isDualPaneCompact || workspaceCompactPane === "source";
    const showChatPane = !isCompactWorkspace || isDualPaneCompact || workspaceCompactPane === "chat";
    const showEnginePane = !isCompactWorkspace || workspaceCompactPane === "engine";
    const sourceCollapsedDesktop = !isCompactWorkspace && isSourceCollapsed;
    const chatCollapsedDesktop = !isCompactWorkspace && isChatCollapsed;

    return (
      <div className="flex h-full min-w-0 flex-1 flex-col gap-3 overflow-visible p-3 pb-24 md:p-4 md:pb-4 lg:flex-row lg:overflow-hidden">
        {isCompactWorkspace ? (
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 p-2 shadow-sm">
            <button
              type="button"
              onClick={() => setWorkspaceCompactPane("source")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                workspaceCompactPane === "source"
                  ? "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100"
                  : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80"
              }`}
            >
              <BookOpen size={14} />
              Source
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceCompactPane("chat")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                workspaceCompactPane === "chat"
                  ? "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100"
                  : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80"
              }`}
            >
              <PencilLine size={14} />
              Chat
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceCompactPane("engine")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                workspaceCompactPane === "engine"
                  ? "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100"
                  : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80"
              }`}
            >
              <ChartSpline size={14} />
              Engine
            </button>
          </div>
        ) : null}

        {showMainShell ? (
          <section
            className={`relative m-0 flex h-full min-w-0 flex-1 flex-col rounded-2xl border border-slate-100 bg-white shadow-sm ${
              isCompactWorkspace ? "min-h-0 overflow-hidden" : "overflow-hidden"
            }`}
          >
            <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 md:px-6 md:py-4">
              <div className="flex items-center gap-3">
                <BookOpen size={18} className="text-slate-400" />
                <h1 className="text-lg font-semibold text-slate-800">Exam Workspace</h1>
              </div>
              <div className="flex items-center gap-2">
                {sourceLibrary.length > 0 ? (
                  <button
                    onClick={clearFile}
                    className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 transition-colors hover:text-red-500"
                    type="button"
                  >
                    <X size={14} /> Clear
                  </button>
                ) : (
                  <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">Ready</span>
                )}
              </div>
            </header>

            {isParsing ? (
              <div className="border-b border-indigo-100 bg-indigo-50/70 px-4 py-2 md:px-6">
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-indigo-700">
                  <span>{parseStage === "uploading" ? "Uploading PDF" : "Processing uploaded file"}</span>
                  {parseStage === "uploading" ? <span>{Math.max(0, Math.min(100, parseProgress))}%</span> : null}
                </div>
                {parseStage === "uploading" ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-indigo-100">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, parseProgress))}%` }}
                    />
                  </div>
                ) : (
                  <p className="text-[11px] font-medium text-indigo-700/90">Upload complete. Waiting for parser response...</p>
                )}
              </div>
            ) : null}

            <div
              className={`grid min-h-0 flex-1 grid-cols-1 gap-0 ${
                isCompactWorkspace
                  ? isDualPaneCompact
                    ? "md:grid-cols-2"
                    : ""
                  : sourceCollapsedDesktop && chatCollapsedDesktop
                    ? "xl:grid-cols-[52px_52px]"
                    : sourceCollapsedDesktop
                      ? "xl:grid-cols-[52px_minmax(0,1fr)]"
                      : chatCollapsedDesktop
                        ? "xl:grid-cols-[minmax(0,1fr)_52px]"
                        : "xl:grid-cols-[minmax(280px,0.36fr)_minmax(0,1fr)]"
              }`}
            >
              {showSourcePane && sourceCollapsedDesktop ? (
                <div className="hidden border-r border-slate-100 bg-slate-50/40 xl:flex xl:flex-col xl:items-center xl:py-5">
                  <button
                    type="button"
                    onClick={() => setIsSourceCollapsed(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
                    aria-label="Expand source panel"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : showSourcePane ? (
                <div className="min-h-0 overflow-y-auto border-r border-slate-100 px-4 py-4 md:px-6 md:py-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <BookOpen size={16} /> Source Panel
                    </h2>
                    {!isCompactWorkspace ? (
                      <button
                        type="button"
                        onClick={() => setIsSourceCollapsed(true)}
                        className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 xl:inline-flex"
                        aria-label="Minimize source panel"
                      >
                        <ChevronLeft size={14} /> Minimize
                      </button>
                    ) : null}
                  </div>

                  <div
                    {...getRootProps()}
                    className={`mb-4 flex items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 transition-colors ${
                      isCreditsDepleted
                        ? "cursor-not-allowed border-slate-200 bg-slate-100/70 opacity-70"
                        : "cursor-pointer"
                    } ${
                      isDragActive
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 bg-slate-50/60 hover:border-indigo-300 hover:bg-white"
                    }`}
                  >
                    <input {...getInputProps()} />
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-indigo-500 shadow-sm">
                      <UploadCloud size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">{sourceLibrary.length > 0 ? "Add one or more source PDFs" : "Drop one or more exam PDFs here"}</p>
                      <p className="text-xs text-slate-500">Drag and drop multiple files, or click to browse</p>
                    </div>
                  </div>

                  {sourceLibrary.length > 0 ? (
                    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Source Library ({sourceLibrary.length})</p>
                      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                        {sourceLibrary.map((source) => (
                          <div key={source.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <div className="mb-2 flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={source.selected}
                                onChange={(event) => setSourceSelected(source.id, event.target.checked)}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSourceId(source.id);
                                  setSourceText(source.text);
                                }}
                                className={`flex-1 truncate text-left text-xs font-medium ${
                                  activeSourceId === source.id ? "text-indigo-700" : "text-slate-700"
                                }`}
                                title={source.name}
                              >
                                {source.name}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSource(source.id)}
                                className="rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-rose-500"
                                aria-label={`Remove ${source.name}`}
                              >
                                <X size={13} />
                              </button>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-slate-500">Role</span>
                              <select
                                value={source.role}
                                onChange={(event) => setSourceRole(source.id, event.target.value as SourceRole)}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700"
                              >
                                <option value="question-paper">Question Paper</option>
                                <option value="marking-scheme">Marking Scheme</option>
                                <option value="model-answer">Model Answer</option>
                                <option value="notes">Notes</option>
                              </select>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-slate-500">Template PDF</span>
                              <label className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50">
                                Re-link PDF
                                <input
                                  type="file"
                                  accept="application/pdf,.pdf"
                                  className="hidden"
                                  onChange={(event) => {
                                    relinkSourcePdf(source.id, event.target.files);
                                    event.currentTarget.value = "";
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {parseDiagnostics ? (
                    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Parse Diagnostics</p>
                      <div className="space-y-2">
                        {parseDiagnostics.passes.map((pass) => (
                          <div key={`${pass.pass}-${pass.jobId ?? "none"}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            <p className="font-semibold text-slate-700">
                              {pass.pass} {parseDiagnostics.selectedPass === pass.pass ? "(used)" : ""}
                            </p>
                            <p>
                              upload: {pass.uploadStatus} | poll: {pass.pollStatus ?? "n/a"} | chars: {pass.extractedChars}
                            </p>
                            {pass.error ? <p className="text-rose-600">error: {pass.error}</p> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {activeSource ? (
                    <div className="min-h-[180px] max-h-[30dvh] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 p-4 xl:h-[calc(100vh-292px)] xl:max-h-none">
                      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
                        <BookOpen size={16} /> Source View - {sourceRoleLabel[activeSource.role]}
                      </h2>
                      <div className="app-ui-content prose prose-sm max-w-none text-slate-700">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeSource.text}</ReactMarkdown>
                      </div>
                    </div>
                  ) : sourceLibrary.length > 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-500">
                      Select a source from Source Library to open Source View.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {showChatPane && chatCollapsedDesktop ? (
                <div className="hidden border-l border-slate-100 bg-slate-50/40 xl:flex xl:flex-col xl:items-center xl:py-5">
                  <button
                    type="button"
                    onClick={() => setIsChatCollapsed(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
                    aria-label="Expand chat panel"
                  >
                    <ChevronLeft size={16} />
                  </button>
                </div>
              ) : showChatPane ? (
                <div className="relative flex min-h-0 flex-col px-4 py-4 md:px-6 md:py-5">
                  <h2 className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold text-slate-600">
                    <span>Exam AI Chat</span>
                    {!isCompactWorkspace ? (
                      <button
                        type="button"
                        onClick={() => setIsChatCollapsed(true)}
                        className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 xl:inline-flex"
                        aria-label="Minimize chat panel"
                      >
                        Minimize <ChevronRight size={14} />
                      </button>
                    ) : null}
                  </h2>
                  <div
                    className={`overflow-y-auto ${
                      isCompactWorkspace
                        ? "min-h-[250px] flex-1 pb-3"
                        : "min-h-[260px] max-h-[48dvh] pb-4 lg:h-[calc(100vh-260px)] lg:max-h-none lg:pb-24"
                    }`}
                  >
                      {workspaceMessages.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-400 md:mt-1">
                        Ask Exam AI to generate questions, mock papers, or revision drills.
                      </div>
                    ) : (
                      workspaceMessages.map((m) => {
                        const rawMessageText = getWorkspaceDisplayText(getMessageText(m), m.role);
                        const isStreamingAssistantMessage =
                          workspaceIsLoading && m.role === "assistant" && m.id === latestWorkspaceAssistantId;
                        const messageText = isStreamingAssistantMessage ? animatedWorkspaceText || rawMessageText : rawMessageText;

                        return (
                          <div key={m.id} className={`mb-2 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div
                              className={
                                m.role === "user"
                                  ? "max-w-[78%] rounded-[20px] bg-orange-500 px-4 py-2.5 text-[14px] leading-6 text-white shadow-[0_8px_20px_rgba(249,115,22,0.22)] md:max-w-[70%] lg:max-w-[64%]"
                                  : "max-w-[94%] rounded-2xl bg-transparent px-3.5 py-2.5 text-slate-800"
                              }
                            >
                              {isStreamingAssistantMessage ? (
                                <div className="memo-response app-ui-content prose prose-sm max-w-none prose-slate prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-1 text-[14px] leading-6">
                                  {renderWorkspaceMarkdown(messageText)}
                                  <span className="chat-typing-cursor-inline" aria-hidden="true" />
                                </div>
                              ) : (
                                <div className="memo-response app-ui-content prose prose-sm max-w-none prose-slate prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-1 prose-code:bg-orange-50 prose-code:text-orange-500 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-medium prose-code:before:content-none prose-code:after:content-none text-[14px] leading-6">
                                  {renderWorkspaceMarkdown(messageText)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    {workspaceStatus === "submitted" ? (
                      <div className="flex justify-start">
                        <div className="assistant-thinking-bubble chat-status-line rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
                          Analysing sources
                        </div>
                      </div>
                    ) : null}
                    {workspaceStatus === "streaming" ? (
                      <p className="chat-status-line text-sm font-medium text-orange-500">Drafting detailed response</p>
                    ) : null}
                    {workspaceStatus === "error" ? (
                      <p className="text-sm font-medium text-rose-500">Response failed. Please resend your question.</p>
                    ) : null}
                  </div>
                  <div
                    className={`pointer-events-none mt-2 ${
                      isCompactWorkspace
                        ? "sticky bottom-0 z-10 bg-gradient-to-t from-white via-white/95 to-transparent pt-3"
                        : "md:absolute md:right-6 md:bottom-6 md:left-6 md:mt-0"
                    }`}
                  >
                    <form
                      onSubmit={handleSubmit}
                      className={`pointer-events-auto flex items-center gap-2 rounded-2xl p-2 pl-4 backdrop-blur ${
                        isCompactWorkspace
                          ? "border border-slate-200 bg-white shadow-lg"
                          : "border border-white/50 bg-white/75 shadow-xl"
                      }`}
                    >
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Add"
                      >
                        <Plus size={18} />
                      </button>
                      <input
                        type="text"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder="Ask Exam AI..."
                        className="flex-1 border-none bg-transparent px-2 text-[14px] text-slate-700 placeholder-slate-400 focus:outline-none"
                        disabled={workspaceIsLoading || isCreditsDepleted}
                      />
                      <button
                        type="submit"
                        disabled={workspaceIsLoading || !input.trim() || isCreditsDepleted}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white transition-colors hover:bg-orange-600 disabled:bg-slate-300"
                        aria-label="Send"
                      >
                        <ArrowUp size={18} strokeWidth={3} />
                      </button>
                    </form>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {showEnginePane ? (
          <aside
            className={`flex w-full rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition-all duration-300 lg:h-full ${
              !isCompactWorkspace && isEngineCollapsed
                ? "min-h-[56px] flex-col items-center justify-center lg:w-[56px]"
                : "flex-col overflow-y-auto p-4 md:p-5 lg:w-[390px]"
            }`}
          >
            {isEngineCollapsed ? (
              <button
                type="button"
                onClick={() => setIsEngineCollapsed(false)}
                className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
                aria-label="Expand examiner engine"
              >
                <ChevronLeft size={16} />
              </button>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                    <ChartSpline size={18} className="text-slate-500" /> Examiner&apos;s Engine
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsEngineCollapsed(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                    aria-label="Minimize examiner engine"
                  >
                    Minimize <ChevronRight size={14} />
                  </button>
                </div>

                <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {studioTools.map((tool) => {
                    const Icon = tool.icon;
                    const toolCost = STUDIO_TOOL_CREDIT_COSTS[tool.id as keyof typeof STUDIO_TOOL_CREDIT_COSTS] ?? 0;
                    return (
                      <button
                        key={tool.id}
                        onClick={tool.onClick}
                        disabled={isCreditsDepleted && toolCost > 0}
                        className={`group flex min-h-28 flex-col items-start justify-start gap-2 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                          activeTool === tool.id ? "border-indigo-300" : "border-slate-200"
                        } disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-sm`}
                        type="button"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tool.tone}`}>
                            <Icon size={16} />
                          </span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                              toolCost === 0 ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"
                            }`}
                          >
                            {toolCost === 0 ? "Free" : `${toolCost}c`}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{tool.label}</span>
                        <span className="text-[11px] text-slate-500">{tool.desc}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-sm font-semibold text-slate-500">Tool Windows</h3>
                  <p className="mb-3 text-xs text-slate-500">
                    Open dedicated mini-app windows for focused grading and timed practice workflows.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openWindow("grade-answer")}
                      disabled={isCreditsDepleted}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600"
                    >
                      <PencilLine size={13} /> Grade Window
                    </button>
                    <button
                      type="button"
                      onClick={openTimedWindow}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Timer size={13} /> Timer Window
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-slate-500">Recent Activity</h3>
                  <ul className="space-y-2 text-xs text-slate-600">
                    <li className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      {sourceLibrary.length > 0 ? `Sources loaded: ${sourceLibrary.length}` : "No source loaded"}
                    </li>
                    <li className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      {sourceLibrary.some((item) => item.text.trim()) ? "Parsed source available" : "Waiting for parsing"}
                    </li>
                    <li className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      {workspaceMessages.length > 0 ? `Chat messages: ${workspaceMessages.length}` : "No chat messages yet"}
                    </li>
                  </ul>
                </div>
              </>
            )}
          </aside>
        ) : null}
      </div>
    );
  };

  const renderVaultView = () => (
    <div className="flex min-w-0 flex-1 overflow-visible p-3 md:overflow-hidden md:p-4">
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-800">Past Paper Vault</h1>
        <p className="mb-6 text-sm text-slate-500">Manage uploaded papers and track revision progress by subject.</p>

        {vaultItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-500">
            No uploaded sources yet. Upload a PDF in Exam Workspace to populate your vault.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vaultItems.map((item) => (
              <article key={item.title} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600">
                    {item.subject}
                  </span>
                  <span className="text-xs text-slate-500">{item.status}</span>
                </div>
                <h2 className="mb-3 line-clamp-2 text-sm font-semibold text-slate-700">{item.title}</h2>
                <div className="mb-2 h-2 rounded-full bg-slate-200">
                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${item.completion}%` }} />
                </div>
                <p className="text-xs text-slate-500">Completion: {item.completion}%</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const renderAnalyticsView = () => (
    <div className="flex min-w-0 flex-1 overflow-visible p-3 md:overflow-hidden md:p-4">
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-800">Analytics Radar</h1>
        <p className="mb-6 text-sm text-slate-500">Performance snapshots from your recent exam practice sessions.</p>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-xs text-slate-500">Average MCQ Accuracy</p>
            <p className="text-2xl font-semibold text-slate-800">75%</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-xs text-slate-500">DBQ Score Trend</p>
            <p className="text-2xl font-semibold text-slate-800">+12%</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-xs text-slate-500">Strongest Topic</p>
            <p className="text-2xl font-semibold text-slate-800">Cold War</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Weakness Radar</h2>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>DBQ provenance analysis</li>
              <li>Source reliability justification</li>
              <li>Map inference precision</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent Improvements</h2>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Better quote integration</li>
              <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Faster MCQ completion</li>
              <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Clearer answer structure</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );

  const renderSyllabusView = () => (
    <div className="flex min-w-0 flex-1 overflow-visible p-3 md:overflow-hidden md:p-4">
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-800">Syllabus Engine</h1>
        <p className="mb-6 text-sm text-slate-500">Configure exam board rules and grading strictness for AI feedback.</p>

        <div className="grid max-w-3xl grid-cols-1 gap-5">
          <label className="text-sm font-medium text-slate-700">
            Exam Board
            <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200">
              <option>IB</option>
              <option>AP</option>
              <option>A-Level</option>
              <option>IGCSE</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Grading Strictness
            <input
              type="range"
              min="1"
              max="5"
              defaultValue="4"
              className="mt-3 w-full accent-indigo-500"
            />
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="mb-2 flex items-center gap-2 font-semibold text-slate-700">
              <SlidersHorizontal size={16} /> Marking Profile
            </p>
            <p>Current profile emphasizes source citation quality, argument structure, and examiner phrasing.</p>
          </div>
        </div>
      </section>
    </div>
  );

  const renderPurchaseView = () => (
    <div className="flex min-w-0 flex-1 overflow-visible p-3 md:overflow-hidden md:p-4">
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="mb-1 text-xl font-semibold text-slate-800">Marketplace</h1>
            <p className="text-sm text-slate-500">Top up credits and understand exactly how each feature spends them.</p>
            <p className="mt-1 text-xs font-semibold text-emerald-700">
              Current balance: {isInfiniteCredits ? "Infinite" : `${userCredits} credits`}
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setMarketplacePanel("store")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                marketplacePanel === "store" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:bg-white/70"
              }`}
            >
              Credit Store
            </button>
            <button
              type="button"
              onClick={() => setMarketplacePanel("usage")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                marketplacePanel === "usage" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:bg-white/70"
              }`}
            >
              Usage
            </button>
          </div>
        </div>

        {creditError ? <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{creditError}</p> : null}

        {marketplacePanel === "store" ? (
          <>
            <p className="mb-6 text-sm text-slate-500">Choose a one-time credit pack. No subscription required.</p>

            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <article className="relative rounded-2xl border-2 border-indigo-300 bg-gradient-to-b from-indigo-50 to-white p-5 shadow-sm">
                <span className="absolute -top-3 right-4 rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-semibold text-white">
                  Most Popular
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Starter Pack</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">USD 4.99</p>
                <p className="mt-1 text-sm text-slate-600">500 credits</p>
                <div className="mt-4 rounded-lg border border-indigo-100 bg-white p-3 text-sm text-slate-700">
                  First purchase bonus: <span className="font-semibold text-indigo-700">1.5x credits</span>
                  <p className="mt-1 text-xs text-slate-500">You receive 750 credits on your first purchase.</p>
                </div>
                <button
                  type="button"
                  className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  Purchase 500 Credits
                </button>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Value Pack</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">USD 8.99</p>
                <p className="mt-1 text-sm text-slate-600">1000 credits</p>
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  First purchase bonus: <span className="font-semibold text-indigo-700">1.5x credits</span>
                  <p className="mt-1 text-xs text-slate-500">You receive 1500 credits on your first purchase.</p>
                </div>
                <button
                  type="button"
                  className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Purchase 1000 Credits
                </button>
              </article>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Credit Policy</h2>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">No expiry: credits never expire.</li>
                <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">No refund: credit purchases are non-refundable.</li>
                <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">Non-transferable: credits cannot be transferred between accounts.</li>
                <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">First purchase only: 1.5x bonus applies once per account.</li>
              </ul>
            </div>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm text-slate-500">Usage Atlas: each action has a clear, predictable credit cost.</p>

            <div className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Credit Rhythm Guide</h2>
                <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Transparent Billing
                </span>
              </div>
              <p className="text-sm text-slate-700">Light tasks are 0-1 credits, core AI workflows are 2-3 credits, and timer/focus tools stay free.</p>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                { label: "Timed Section", detail: "Start / pause / reset sprint", cost: 0, tone: "emerald" },
                { label: "Upload + Parse PDF", detail: "Process one source file", cost: 1, tone: "sky" },
                { label: "Exam AI Chat", detail: "One grounded chat question", cost: 1, tone: "indigo" },
                { label: "Extract DBQs / Sources", detail: "One extraction run", cost: 2, tone: "violet" },
                { label: "AI Mock Edit", detail: "One edit instruction applied", cost: 2, tone: "fuchsia" },
                { label: "Grade My Answer", detail: "One grading + model feedback", cost: 2, tone: "blue" },
                { label: "Marking Rules", detail: "Generate examiner rule matrix", cost: 2, tone: "cyan" },
                { label: "Topic Predictor", detail: "Forecast likely upcoming topics", cost: 3, tone: "amber" },
                { label: "Generate Mock Paper", detail: "Full paper + mark scheme", cost: 3, tone: "rose" },
              ].map((item) => (
                <article key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-800">{item.label}</h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.cost === 0
                          ? "bg-emerald-100 text-emerald-700"
                          : item.cost <= 2
                            ? "bg-sky-100 text-sky-700"
                            : item.cost <= 4
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {item.cost === 0 ? "Free" : `${item.cost} credits`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{item.detail}</p>
                </article>
              ))}
            </div>

          </>
        )}
      </section>
    </div>
  );

  const dockWindows = Object.values(desktopState.windows)
    .filter((windowState) => windowState.isOpen)
    .sort((left, right) => left.zIndex - right.zIndex);

  if (isAuthLoading) {
    return (
      <main className={`${bodyFont.className} app-ui-chrome flex min-h-dvh w-full items-center justify-center bg-slate-100 p-4 text-slate-800`}>
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          <LoaderCircle size={16} className="animate-spin" /> Checking session...
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className={`${bodyFont.className} app-ui-chrome flex min-h-dvh w-full items-center justify-center bg-slate-100 p-4 text-slate-800`}>
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">ExamOS Access</p>
          <h1 className={`${headingFont.className} mb-2 text-3xl font-semibold text-slate-900`}>
            {authMode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            {authMode === "signin"
              ? "Use your account to continue your revision workspace."
              : "Create a real account to sync secure login sessions."}
          </p>

          <form className="space-y-4" onSubmit={handleSignIn}>
            {authMode === "signup" ? (
              <label className="block text-sm font-medium text-slate-700">
                Display name (optional)
                <input
                  type="text"
                  value={authNameInput}
                  onChange={(event) => setAuthNameInput(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Scholar"
                />
              </label>
            ) : null}

            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                type="email"
                value={authEmailInput}
                onChange={(event) => setAuthEmailInput(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                value={authPasswordInput}
                onChange={(event) => setAuthPasswordInput(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="At least 6 characters"
                required
              />
            </label>

            {authError ? <p className="text-sm text-rose-600">{authError}</p> : null}

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              <LogIn size={16} /> {authMode === "signin" ? "Continue to ExamOS" : "Create account and continue"}
            </button>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Globe size={16} /> {authMode === "signin" ? "Continue with Google" : "Sign up with Google"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setAuthError(null);
              setAuthMode((mode) => (mode === "signin" ? "signup" : "signin"));
            }}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {authMode === "signin" ? "No account yet? Create one" : "Already have an account? Sign in"}
          </button>
        </div>
      </main>
    );
  }

  if (showStartupSplash) {
    return (
      <motion.main
        className={`${bodyFont.className} app-ui-chrome relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-slate-100 text-slate-700`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45 }}
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_26%_24%,rgba(59,130,246,0.2),transparent_42%),radial-gradient(circle_at_78%_76%,rgba(14,165,233,0.16),transparent_38%),linear-gradient(140deg,#f8fafc,#eef2ff_45%,#ecfeff)]"
          animate={
            splashStage === "exit"
              ? { filter: "blur(8px)", opacity: 0.35 }
              : { filter: "blur(0px)", opacity: 1 }
          }
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        />

        <div className="relative z-10 flex flex-col items-center">
          <motion.h1
            className={`${headingFont.className} text-6xl font-semibold tracking-tight text-slate-800 md:text-7xl`}
            initial={false}
            animate={
              splashStage === "idle"
                ? { scale: 1, y: 0, opacity: 1, filter: "blur(0px)" }
                : splashStage === "expand"
                  ? { scale: 1.26, y: 0, opacity: 1, filter: "blur(0px)" }
                  : { scale: 1.08, y: -120, opacity: 0, filter: "blur(4px)" }
            }
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            ExamOS
          </motion.h1>

          <motion.p
            className="mt-3 text-sm font-medium uppercase tracking-[0.2em] text-slate-500"
            initial={false}
            animate={splashStage === "exit" ? { opacity: 0, y: -14 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            Revision desktop initializing
          </motion.p>

          <motion.div
            className="mt-6 flex items-center gap-4 text-xs text-slate-600"
            initial={false}
            animate={splashStage === "exit" ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {[
              { label: "Parse Engine", delay: 0 },
              { label: "AI Core", delay: 0.35 },
              { label: "Focus Mode", delay: 0.7 },
            ].map((chip) => (
              <div
                key={chip.label}
                className="inline-flex items-center gap-2 rounded-full border border-indigo-100/90 bg-white/70 px-3 py-1.5 shadow-sm"
              >
                <motion.span
                  className="h-2 w-2 rounded-full bg-sky-500"
                  animate={{ opacity: [0.35, 1, 0.35], scale: [0.92, 1.16, 0.92] }}
                  transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, delay: chip.delay }}
                />
                {chip.label}
              </div>
            ))}
          </motion.div>
        </div>
      </motion.main>
    );
  }

  if (showCoverPage) {
    return (
      <motion.main
        initial={{ opacity: 0, filter: "blur(12px)", y: -18 }}
        animate={
          coverTransitioning
            ? { opacity: 0, filter: "blur(10px)", y: 56 }
            : { opacity: 1, filter: "blur(0px)", y: 0 }
        }
        transition={{ duration: coverTransitioning ? 0.42 : 0.55, ease: [0.22, 1, 0.36, 1] }}
        className={`${bodyFont.className} app-ui-chrome relative flex min-h-dvh w-full items-stretch justify-center overflow-hidden bg-slate-100 text-slate-800`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent_40%),radial-gradient(circle_at_80%_70%,rgba(14,165,233,0.12),transparent_35%),linear-gradient(140deg,#f8fafc,#eef2ff_45%,#ecfeff)]" />

        <section className="relative z-10 min-h-dvh w-full overflow-y-auto border border-white/70 bg-white/88 shadow-2xl backdrop-blur-sm md:h-full md:overflow-hidden">
          <button
            type="button"
            onClick={handleSignOut}
            className="absolute top-5 right-5 z-20 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            aria-label="Sign out from cover page"
          >
            <LogOut size={14} /> Sign out
          </button>

          <motion.div
            aria-hidden
            initial={{ opacity: 0.25, x: -40, y: 20 }}
            animate={{ opacity: [0.22, 0.34, 0.22], x: [-40, -16, -40], y: [20, 6, 20] }}
            transition={{ duration: 12, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            className="pointer-events-none absolute -top-20 -left-12 h-64 w-64 rounded-full bg-indigo-200/30 blur-3xl"
          />
          <motion.div
            aria-hidden
            initial={{ opacity: 0.2, x: 30, y: -20 }}
            animate={{ opacity: [0.16, 0.28, 0.16], x: [30, 8, 30], y: [-20, 8, -20] }}
            transition={{ duration: 14, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            className="pointer-events-none absolute right-8 bottom-0 h-56 w-56 rounded-full bg-cyan-200/30 blur-3xl"
          />

          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="border-b border-slate-200/70 p-6 md:border-r md:border-b-0 md:p-12">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">ExamOS</p>
              <h1 className={`${headingFont.className} mb-2 text-4xl font-semibold leading-tight text-slate-900 md:text-5xl`}>
                {getGreeting()},
                <br />
                {learnerName}.
              </h1>
              <p className="mb-6 max-w-lg text-base text-slate-600 md:text-lg">Your revision cockpit is online. Pick one mission and move.</p>

              <div className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50/80 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">Motivation</p>
                <div className="min-h-[58px]">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={motivationIndex}
                      initial={{ opacity: 0, y: 10, filter: "blur(3px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -10, filter: "blur(2px)" }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="text-lg font-medium text-slate-800"
                    >
                      {motivationLines[motivationIndex]}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>

              <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Credits</p>
                  <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    Free Trial
                  </span>
                </div>
                <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-emerald-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${creditBarPercent}%` }}
                  />
                </div>
                <p className="text-sm font-medium text-emerald-800">
                  {isInfiniteCredits ? "Infinite credits" : `${cappedCredits} / ${FREE_TRIAL_CREDIT_LIMIT} credits`}
                </p>
              </div>

              <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">Greeting name</p>
                  <button
                    type="button"
                    onClick={() => openEditField("learnerName")}
                    className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Edit greeting name"
                  >
                    <PencilLine size={14} />
                  </button>
                </div>
                {editingFields.learnerName ? (
                  <input
                    value={learnerName}
                    onChange={(event) => setLearnerName(event.target.value || "Scholar")}
                    onBlur={() => closeEditField("learnerName")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        closeEditField("learnerName");
                      }
                    }}
                    autoFocus
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Enter your name"
                  />
                ) : (
                  <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">{learnerName}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={enterDesktop}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  <HomeIcon size={16} /> Boot ExamOS
                </button>
                <button
                  type="button"
                  onClick={startFocusSprintFromCover}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Timer size={16} /> Start 15-min Sprint
                </button>
              </div>
            </div>

            <div className="p-6 pb-24 md:p-12">
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.1 }}
                  className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4"
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Local time</p>
                  <p className={`${headingFont.className} text-3xl font-semibold text-slate-900`}>{clockTimeLabel}</p>
                  <p className="text-xs text-slate-500">{clockDateLabel}</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.18 }}
                  className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4"
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">System Pulse</p>
                  <div className="space-y-2">
                    {[
                      { label: "Focus Engine", delay: 0 },
                      { label: "Parse Pipeline", delay: 0.35 },
                      { label: "AI Assistant", delay: 0.7 },
                    ].map((pulse) => (
                      <div key={pulse.label} className="flex items-center gap-2 text-xs text-slate-600">
                        <motion.span
                          className="h-2 w-2 rounded-full bg-emerald-500"
                          animate={{ opacity: [0.35, 1, 0.35], scale: [0.92, 1.16, 0.92] }}
                          transition={{ duration: 2.1, repeat: Number.POSITIVE_INFINITY, delay: pulse.delay }}
                        />
                        {pulse.label}
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>

              <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Daily Brief</h2>

              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs text-slate-500">Days to exam</p>
                    <button
                      type="button"
                      onClick={() => openEditField("examDate")}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Edit exam date"
                    >
                      <PencilLine size={13} />
                    </button>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900">{daysToExam}</p>
                  {editingFields.examDate ? (
                    <input
                      type="date"
                      value={examDateInput}
                      onChange={(event) => setExamDateInput(event.target.value)}
                      onBlur={() => closeEditField("examDate")}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      autoFocus
                    />
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">Exam date: {examDateInput}</p>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs text-slate-500">Focus subject</p>
                    <button
                      type="button"
                      onClick={() => openEditField("focusSubject")}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Edit focus subject"
                    >
                      <PencilLine size={13} />
                    </button>
                  </div>
                  {editingFields.focusSubject ? (
                    <input
                      value={focusSubject}
                      onChange={(event) => setFocusSubject(event.target.value || "History")}
                      onBlur={() => closeEditField("focusSubject")}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          closeEditField("focusSubject");
                        }
                      }}
                      autoFocus
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  ) : (
                    <p className="text-2xl font-semibold text-slate-900">{focusSubject}</p>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs text-slate-500">Current streak</p>
                    <button
                      type="button"
                      onClick={() => openEditField("streakDays")}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Edit streak days"
                    >
                      <PencilLine size={13} />
                    </button>
                  </div>
                  {editingFields.streakDays ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={streakDays}
                        onChange={(event) => setStreakDays(Math.max(0, Number(event.target.value || 0)))}
                        onBlur={() => closeEditField("streakDays")}
                        autoFocus
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                      <span className="text-xs text-slate-500">days</span>
                    </div>
                  ) : (
                    <p className="text-2xl font-semibold text-slate-900">{streakDays} days</p>
                  )}
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Today&apos;s mission</p>
                  <button
                    type="button"
                    onClick={() => openEditField("dailyMission")}
                    className="rounded-md p-1 text-emerald-500 transition hover:bg-emerald-100 hover:text-emerald-700"
                    aria-label="Edit daily mission"
                  >
                    <PencilLine size={13} />
                  </button>
                </div>
                {editingFields.dailyMission ? (
                  <textarea
                    value={dailyMission}
                    onChange={(event) => setDailyMission(event.target.value)}
                    onBlur={() => closeEditField("dailyMission")}
                    className="min-h-[74px] w-full resize-none rounded-lg border border-emerald-100 bg-white/90 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    autoFocus
                  />
                ) : (
                  <p className="text-sm text-slate-700">{dailyMission}</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">Quick Launch</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      animateCoverExit(() => {
                        setActiveView("workspace");
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    <BookOpen size={15} /> Resume Workspace
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      animateCoverExit(() => {
                        setActiveView("analytics");
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    <BarChart3 size={15} /> View Analytics
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </motion.main>
    );
  }

  return (
    <main className={`${bodyFont.className} app-ui-chrome flex h-dvh w-full flex-col overflow-hidden bg-slate-50 text-slate-800 md:flex-row`}>
      {isCreditsDepleted ? (
        <div className="pointer-events-none fixed top-3 right-3 left-3 z-[70] md:left-20">
          <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-lg">
            <p className="font-medium">You have used up your credits. Paid functions are locked until you top up.</p>
            <button
              type="button"
              onClick={teleportToMarketplace}
              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              Go to Marketplace
            </button>
          </div>
        </div>
      ) : null}

      <nav className="z-10 hidden h-full w-16 flex-shrink-0 border-r border-slate-100 bg-white py-6 md:flex md:flex-col md:items-center">
        <div className="mb-8 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-sm font-bold text-white">
          E
        </div>
        <div className="flex flex-col gap-6">
          <button className={navClass("workspace")} aria-label="Dashboard" onClick={() => setActiveView("workspace")}>
            <HomeIcon size={20} />
          </button>
          <button className={navClass("purchase")} aria-label="Credit Store" onClick={() => setActiveView("purchase")}>
            <BadgeDollarSign size={20} />
          </button>
          <button className={navClass("vault")} aria-label="Past Papers" onClick={() => setActiveView("vault")}>
            <FolderOpen size={20} />
          </button>
          <button className={navClass("analytics")} aria-label="Analytics" onClick={() => setActiveView("analytics")}>
            <BarChart3 size={20} />
          </button>
        </div>
        <div className="mt-auto flex flex-col gap-6">
          <button
            className="rounded-xl p-2 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-700"
            aria-label="Exit to cover page"
            onClick={handleExitToCover}
          >
            <LogOut size={20} />
          </button>
          <button className={navClass("syllabus")} aria-label="Settings" onClick={() => setActiveView("syllabus")}>
            <Settings size={20} />
          </button>
        </div>
      </nav>

      {activeView === "workspace" && renderWorkspaceView()}
      {activeView === "purchase" && renderPurchaseView()}
      {activeView === "vault" && renderVaultView()}
      {activeView === "analytics" && renderAnalyticsView()}
      {activeView === "syllabus" && renderSyllabusView()}

      <nav className="fixed right-3 bottom-3 left-3 z-40 rounded-2xl border border-white/70 bg-white/95 p-2 shadow-xl backdrop-blur md:hidden">
        <div className="grid grid-cols-5 gap-1">
          <button className={navClass("workspace")} aria-label="Dashboard" onClick={() => setActiveView("workspace")}>
            <HomeIcon size={18} />
          </button>
          <button className={navClass("purchase")} aria-label="Credit Store" onClick={() => setActiveView("purchase")}>
            <BadgeDollarSign size={18} />
          </button>
          <button className={navClass("vault")} aria-label="Past Papers" onClick={() => setActiveView("vault")}>
            <FolderOpen size={18} />
          </button>
          <button className={navClass("analytics")} aria-label="Analytics" onClick={() => setActiveView("analytics")}>
            <BarChart3 size={18} />
          </button>
          <button className={navClass("syllabus")} aria-label="Settings" onClick={() => setActiveView("syllabus")}>
            <Settings size={18} />
          </button>
        </div>
        <button
          className="mt-2 w-full rounded-xl p-2 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-700"
          aria-label="Exit to cover page"
          onClick={handleExitToCover}
        >
          <LogOut size={18} className="mx-auto" />
        </button>
      </nav>

      <DraggableWindow
        windowId="answer-key"
        title="Generate Mock Paper"
        win={desktopState.windows["answer-key"]}
        isFocused={desktopState.focusedId === "answer-key"}
        onFocus={() => dispatchDesktop({ type: "FOCUS_WINDOW", id: "answer-key" })}
        onClose={() => closeWindow("answer-key")}
        onMinimize={() => dispatchDesktop({ type: "MINIMIZE_WINDOW", id: "answer-key" })}
        onToggleMaximize={() => dispatchDesktop({ type: "TOGGLE_MAXIMIZE", id: "answer-key" })}
        onMove={(x, y) => dispatchDesktop({ type: "MOVE_WINDOW", id: "answer-key", x, y })}
        onResize={(width, height) => dispatchDesktop({ type: "RESIZE_WINDOW", id: "answer-key", width, height })}
        contentClassName="h-full overflow-y-auto p-6"
      >
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Generation Process</p>
            {mockPaperEditQueue.length > 0 ? (
              <p className="text-xs font-medium text-amber-600">Queued edits: {mockPaperEditQueue.length}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {[
              { id: "analyzing", label: "Analyzing Sources" },
              { id: "template", label: "Template Match" },
              { id: "drafting", label: "Drafting Paper" },
              { id: "markscheme", label: "Mark Scheme" },
              { id: "formatting", label: "Printable Layout" },
            ].map((step, index) => {
              const order: Record<string, number> = { analyzing: 1, template: 2, drafting: 3, markscheme: 4, formatting: 5, done: 6, idle: 0 };
              const active = order[mockPaperGenerationStage] >= index + 1;
              return (
                <div
                  key={step.id}
                  className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${
                    active ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {step.label}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <select
            value={mockPaperDifficulty}
            onChange={(event) => setMockPaperDifficulty(event.target.value as "balanced" | "exam-hard" | "mostly-medium")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            aria-label="Mock paper difficulty mix"
          >
            <option value="balanced">Difficulty: Balanced</option>
            <option value="exam-hard">Difficulty: Mostly exam-hard</option>
            <option value="mostly-medium">Difficulty: Mostly medium</option>
          </select>
          <button
            type="button"
            onClick={() => void generateMockPaper()}
            disabled={answerKeyLoading || isCreditsDepleted}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:bg-slate-300"
          >
            {answerKeyLoading ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />}
            Generate Mock Paper
          </button>
          <button
            type="button"
            onClick={() => void generateMockPaper("exam-hard")}
            disabled={answerKeyLoading || isCreditsDepleted}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
          >
            Regenerate Harder
          </button>
          <button
            type="button"
            onClick={() => setAnswerKeyOutput("")}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Clear Output
          </button>
          <button
            type="button"
            onClick={() => setIsEditingAnswerKeyOutput((editing) => !editing)}
            disabled={!answerKeyOutput.trim()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEditingAnswerKeyOutput ? "Save Edits" : "Edit Output"}
          </button>
          <select
            value={answerKeyExportFormat}
            onChange={(event) => setAnswerKeyExportFormat(event.target.value as "doc" | "pdf")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            aria-label="Export format"
          >
            <option value="doc">.doc</option>
            <option value="pdf">.pdf</option>
          </select>
          <button
            type="button"
            onClick={() => exportMockPaperOutput(answerKeyExportFormat)}
            disabled={!answerKeyOutput.trim()}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Output Text
          </button>
          {mockPaperNotice ? <p className="text-sm text-amber-600">{mockPaperNotice}</p> : null}
          {answerKeyError ? <p className="text-sm text-rose-500">{answerKeyError}</p> : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">Generated Mock Paper</h3>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={showTemplateUnderlay}
                    onChange={(event) => setShowTemplateUnderlay(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  Template PDF Underlay
                </label>
              </div>
            </div>
            {answerKeyOutput ? (
              isEditingAnswerKeyOutput ? (
                <textarea
                  value={answerKeyOutput}
                  onChange={(event) => setAnswerKeyOutput(event.target.value)}
                  className="h-[360px] w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              ) : (
                <div ref={mockPaperPreviewRef} className="rounded-xl border border-slate-200 bg-slate-100 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs font-semibold text-slate-600">
                      Preview pages: {getMockPaperPages(answerKeyOutput).length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMockPaperPreviewZoom((prev) => Math.max(50, prev - 10))}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        -
                      </button>
                      <span className="min-w-[52px] text-center text-xs font-semibold text-slate-700">{mockPaperPreviewZoom}%</span>
                      <button
                        type="button"
                        onClick={() => setMockPaperPreviewZoom((prev) => Math.min(125, prev + 10))}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => setMockPaperPreviewZoom(80)}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <div className={`${showTemplateUnderlay && templatePreviewPdfUrl ? "grid gap-4 xl:grid-cols-2" : "block"}`}>
                    {showTemplateUnderlay && templatePreviewPdfUrl ? (
                      <div className="rounded-lg border border-slate-300 bg-white p-2 shadow-sm">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Template PDF: {templatePreviewSource?.name}
                        </p>
                        <iframe
                          src={templatePreviewPdfUrl}
                          title="Uploaded past paper template"
                          className="h-[940px] w-full rounded border border-slate-200"
                        />
                      </div>
                    ) : null}

                    <div className="mx-auto w-full max-w-[820px] space-y-4">
                      {getMockPaperPages(answerKeyOutput).map((page, index) => (
                        <div
                          key={`mock-paper-page-wrap-${index}`}
                          className="mx-auto"
                          style={{
                            width: `${MOCK_PAPER_A4_WIDTH_PX * previewScale}px`,
                            height: `${MOCK_PAPER_A4_HEIGHT_PX * previewScale}px`,
                          }}
                        >
                          <div
                            style={{
                              transform: `scale(${previewScale})`,
                              transformOrigin: "top left",
                              width: `${MOCK_PAPER_A4_WIDTH_PX}px`,
                              height: `${MOCK_PAPER_A4_HEIGHT_PX}px`,
                            }}
                          >
                            <div
                              className="mock-paper-preview-page rounded-sm border border-slate-300 bg-white px-10 py-8 shadow-sm"
                              style={{
                                width: `${MOCK_PAPER_A4_WIDTH_PX}px`,
                                maxWidth: `${MOCK_PAPER_A4_WIDTH_PX}px`,
                                height: `${MOCK_PAPER_A4_HEIGHT_PX}px`,
                                minHeight: `${MOCK_PAPER_A4_HEIGHT_PX}px`,
                                aspectRatio: "210 / 297",
                              }}
                            >
                              <div className="mock-paper-preview app-ui-content prose prose-sm max-w-none text-slate-800">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{page}</ReactMarkdown>
                              </div>
                              <div className="mt-8 border-t border-slate-200 pt-2 text-right text-[11px] text-slate-500">Page {index + 1}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      <p className="text-[11px] text-slate-500">Template fidelity mode: mirrors uploaded past-paper structure, symbols, and page breaks when available.</p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <p className="text-sm text-slate-500">
                No mock paper yet. Click Generate to build a printable exam-style paper with a mark scheme appendix.
              </p>
            )}
          </div>

          <div className="flex min-h-[420px] flex-col rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">AI Mock Paper Editor</h3>
            <p className="mb-3 text-xs text-slate-500">Ask AI to modify structure, difficulty, wording, or section composition.</p>

            <div className="mb-3 flex-1 space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2">
              {mockPaperChatMessages.length === 0 ? (
                <p className="text-xs text-slate-500">Example: "Make Section B source analysis harder and add 5 more marks."</p>
              ) : (
                mockPaperChatMessages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-5 ${
                        message.role === "user"
                          ? "bg-indigo-500 text-white"
                          : "border border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      {message.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            {mockPaperChatError ? <p className="mb-2 text-xs text-rose-500">{mockPaperChatError}</p> : null}

            <div className="flex items-end gap-2">
              <textarea
                value={mockPaperChatInput}
                onChange={(event) => setMockPaperChatInput(event.target.value)}
                placeholder="Modify this mock paper..."
                className="h-20 flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <button
                type="button"
                onClick={applyMockPaperEdit}
                disabled={mockPaperChatLoading || !mockPaperChatInput.trim() || isCreditsDepleted}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600 disabled:bg-slate-300"
              >
                {mockPaperChatLoading ? <LoaderCircle size={12} className="animate-spin" /> : null}
                Apply
              </button>
            </div>
          </div>
        </div>
      </DraggableWindow>

      <DraggableWindow
        windowId="grade-answer"
        title="Grade My Answer"
        win={desktopState.windows["grade-answer"]}
        isFocused={desktopState.focusedId === "grade-answer"}
        onFocus={() => dispatchDesktop({ type: "FOCUS_WINDOW", id: "grade-answer" })}
        onClose={() => closeWindow("grade-answer")}
        onMinimize={() => dispatchDesktop({ type: "MINIMIZE_WINDOW", id: "grade-answer" })}
        onToggleMaximize={() => dispatchDesktop({ type: "TOGGLE_MAXIMIZE", id: "grade-answer" })}
        onMove={(x, y) => dispatchDesktop({ type: "MOVE_WINDOW", id: "grade-answer", x, y })}
        onResize={(width, height) => dispatchDesktop({ type: "RESIZE_WINDOW", id: "grade-answer", width, height })}
        contentClassName="h-full overflow-y-auto p-6"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-600">Paste your response</p>
            <textarea
              value={gradingAnswer}
              onChange={(event) => setGradingAnswer(event.target.value)}
              placeholder="Paste your essay/DBQ response here..."
              disabled={isCreditsDepleted}
              className="mb-3 h-56 w-full resize-none rounded-xl border border-slate-200 p-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={runGradeAnswer}
                disabled={gradingIsLoading || !gradingAnswer.trim() || isCreditsDepleted}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:bg-slate-300"
              >
                {gradingIsLoading ? <LoaderCircle size={14} className="animate-spin" /> : null}
                Grade Answer
              </button>
              <button
                type="button"
                onClick={() => setGradingAnswer("")}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">Scorecard</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingGradingFeedback((editing) => !editing)}
                  disabled={!latestAssistantFeedback.trim()}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isEditingGradingFeedback ? "Save Edits" : "Edit Feedback"}
                </button>
                <select
                  value={gradingExportFormat}
                  onChange={(event) => setGradingExportFormat(event.target.value as "doc" | "pdf")}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  aria-label="Grading export format"
                >
                  <option value="doc">.doc</option>
                  <option value="pdf">.pdf</option>
                </select>
                <button
                  type="button"
                  onClick={() => exportGradingOutput(gradingExportFormat)}
                  disabled={!latestAssistantFeedback.trim()}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Output Text
                </button>
              </div>
            </div>
            {scoreMatch ? (
              <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">Latest score detected</p>
                <p className="text-3xl font-semibold text-indigo-600">
                  {scoreMatch[1]}/{scoreMatch[2]}
                </p>
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                No score detected yet. Run grading to populate this panel.
              </div>
            )}

            <div className="app-ui-content prose prose-sm max-w-none text-slate-700">
              {gradingFeedbackDraft ? (
                isEditingGradingFeedback ? (
                  <textarea
                    value={gradingFeedbackDraft}
                    onChange={(event) => setGradingFeedbackDraft(event.target.value)}
                    className="h-[320px] w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                ) : gradingIsLoading ? (
                  <pre className="app-ui-content whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{gradingFeedbackDraft}</pre>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{gradingFeedbackDraft}</ReactMarkdown>
                )
              ) : (
                <p className="text-sm text-slate-500">Grading feedback will appear here in a clean examiner-style breakdown.</p>
              )}
            </div>
          </div>
        </div>
      </DraggableWindow>

      <DraggableWindow
        windowId="timed-section"
        title="Timed Section"
        win={desktopState.windows["timed-section"]}
        isFocused={desktopState.focusedId === "timed-section"}
        onFocus={() => dispatchDesktop({ type: "FOCUS_WINDOW", id: "timed-section" })}
        onClose={() => closeWindow("timed-section")}
        onMinimize={() => dispatchDesktop({ type: "MINIMIZE_WINDOW", id: "timed-section" })}
        onToggleMaximize={() => dispatchDesktop({ type: "TOGGLE_MAXIMIZE", id: "timed-section" })}
        onMove={(x, y) => dispatchDesktop({ type: "MOVE_WINDOW", id: "timed-section", x, y })}
        onResize={(width, height) => dispatchDesktop({ type: "RESIZE_WINDOW", id: "timed-section", width, height })}
        contentClassName="h-full overflow-y-auto p-5"
      >
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Section Name
            <input
              type="text"
              value={timedSectionName}
              onChange={(event) => setTimedSectionName(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Duration (minutes)
            <input
              type="number"
              min={1}
              max={180}
              value={timedMinutes}
              onChange={(event) => setTimedMinutes(Number(event.target.value || 1))}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-900 p-6 text-center text-white">
          <p className="mb-2 text-sm text-slate-300">{timedSectionName || "Exam Section"}</p>
          <p className="text-5xl font-semibold tracking-wider">{formatClock(secondsLeft)}</p>
          <p className="mt-2 text-xs text-slate-400">
            {secondsLeft === 0 ? "Time is up. Submit your answer now." : "Focus mode in progress."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startTimedSession}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600"
          >
            Start Timer
          </button>
          <button
            type="button"
            onClick={toggleTimer}
            disabled={secondsLeft === 0}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:text-slate-300"
          >
            {timerRunning ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            onClick={resetTimedSession}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Reset
          </button>
        </div>
      </DraggableWindow>

      <DraggableWindow
        windowId="marking-rules"
        title="Syllabus Marking Rules"
        win={desktopState.windows["marking-rules"]}
        isFocused={desktopState.focusedId === "marking-rules"}
        onFocus={() => dispatchDesktop({ type: "FOCUS_WINDOW", id: "marking-rules" })}
        onClose={() => closeWindow("marking-rules")}
        onMinimize={() => dispatchDesktop({ type: "MINIMIZE_WINDOW", id: "marking-rules" })}
        onToggleMaximize={() => dispatchDesktop({ type: "TOGGLE_MAXIMIZE", id: "marking-rules" })}
        onMove={(x, y) => dispatchDesktop({ type: "MOVE_WINDOW", id: "marking-rules", x, y })}
        onResize={(width, height) => dispatchDesktop({ type: "RESIZE_WINDOW", id: "marking-rules", width, height })}
        contentClassName="h-full overflow-y-auto p-6"
      >
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generateMarkingRules}
            disabled={markingRulesLoading || isCreditsDepleted}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:bg-slate-300"
          >
            {markingRulesLoading ? <LoaderCircle size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Generate Rules from Current Paper
          </button>
          <button
            type="button"
            onClick={() => setIsEditingMarkingRulesDraft((editing) => !editing)}
            disabled={!markingRulesDraft.trim()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEditingMarkingRulesDraft ? "Save Edits" : "Edit Output"}
          </button>
          <select
            value={markingRulesExportFormat}
            onChange={(event) => setMarkingRulesExportFormat(event.target.value as "doc" | "pdf")}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            aria-label="Marking rules export format"
          >
            <option value="doc">.doc</option>
            <option value="pdf">.pdf</option>
          </select>
          <button
            type="button"
            onClick={() => exportMarkingRulesOutput(markingRulesExportFormat)}
            disabled={!markingRulesDraft.trim()}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Output Text
          </button>
          {markingRulesError ? <p className="text-sm text-rose-500">{markingRulesError}</p> : null}
        </div>

        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Command Word Decoder</h3>
          {markingRulesData?.commandWords?.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {markingRulesData.commandWords.map((item) => (
                <div key={`${item.word}-${item.requirement}`} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">{item.word}</p>
                  <p className="text-sm text-slate-600">{item.requirement}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Generate rules to decode command words from this paper.</p>
          )}
        </div>

        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Score Band Matrix</h3>
          {markingRulesData?.markBands?.length ? (
            <div className="space-y-3">
              {markingRulesData.markBands.map((band) => (
                <details key={`${band.level}-${band.marks}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700">
                    {band.level} ({band.marks})
                  </summary>
                  <p className="mt-2 text-sm text-slate-600">{band.criteria}</p>
                </details>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Mark bands will appear here after generation.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Max-Mark Checklist</h3>
          {markingRulesData?.checklist?.length ? (
            <ul className="space-y-2 text-sm text-slate-600">
              {markingRulesData.checklist.map((item) => (
                <li key={item} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Checklist requirements will be listed here.</p>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Editable Full Output</h3>
          {markingRulesDraft ? (
            isEditingMarkingRulesDraft ? (
              <textarea
                value={markingRulesDraft}
                onChange={(event) => setMarkingRulesDraft(event.target.value)}
                className="h-[260px] w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            ) : (
              <div className="app-ui-content prose prose-sm max-w-none text-slate-700">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markingRulesDraft}</ReactMarkdown>
              </div>
            )
          ) : (
            <p className="text-sm text-slate-500">Generate rules first, then optionally edit the full text output here.</p>
          )}
        </div>
      </DraggableWindow>

      <DraggableWindow
        windowId="topic-predictor"
        title="Syllabus Predictor Radar"
        win={desktopState.windows["topic-predictor"]}
        isFocused={desktopState.focusedId === "topic-predictor"}
        onFocus={() => dispatchDesktop({ type: "FOCUS_WINDOW", id: "topic-predictor" })}
        onClose={() => closeWindow("topic-predictor")}
        onMinimize={() => dispatchDesktop({ type: "MINIMIZE_WINDOW", id: "topic-predictor" })}
        onToggleMaximize={() => dispatchDesktop({ type: "TOGGLE_MAXIMIZE", id: "topic-predictor" })}
        onMove={(x, y) => dispatchDesktop({ type: "MOVE_WINDOW", id: "topic-predictor", x, y })}
        onResize={(width, height) => dispatchDesktop({ type: "RESIZE_WINDOW", id: "topic-predictor", width, height })}
        contentClassName="h-full overflow-y-auto p-6"
      >
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generateTopicPredictions}
            disabled={topicPredictorLoading || isCreditsDepleted}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:bg-slate-300"
          >
            {topicPredictorLoading ? <LoaderCircle size={14} className="animate-spin" /> : <TrendingUp size={14} />}
            Analyze Paper & Forecast Topics
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400"
          >
            Generate Revision Plan (Coming Soon)
          </button>
          <button
            type="button"
            onClick={() => setIsEditingTopicPredictorDraft((editing) => !editing)}
            disabled={!topicPredictorDraft.trim()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEditingTopicPredictorDraft ? "Save Edits" : "Edit Output"}
          </button>
          <select
            value={topicPredictorExportFormat}
            onChange={(event) => setTopicPredictorExportFormat(event.target.value as "doc" | "pdf")}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            aria-label="Topic predictor export format"
          >
            <option value="doc">.doc</option>
            <option value="pdf">.pdf</option>
          </select>
          <button
            type="button"
            onClick={() => exportTopicPredictorOutput(topicPredictorExportFormat)}
            disabled={!topicPredictorDraft.trim()}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Output Text
          </button>
          {topicPredictorError ? <p className="text-sm text-rose-500">{topicPredictorError}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {topicPredictorData?.predictions?.length ? (
            topicPredictorData.predictions.map((prediction) => (
              <article key={`${prediction.topic}-${prediction.confidence}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-800">{prediction.topic}</h3>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${confidenceBadgeClass(
                      prediction.confidence,
                    )}`}
                  >
                    {prediction.confidence} Confidence
                  </span>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Why this is likely</p>
                  <p className="text-sm text-slate-600">{prediction.evidence}</p>
                </div>
              </article>
            ))
          ) : (
            <div className="md:col-span-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No predictions yet. Run the forecast analysis to populate topic cards with confidence bands and evidence.
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Editable Full Output</h3>
          {topicPredictorDraft ? (
            isEditingTopicPredictorDraft ? (
              <textarea
                value={topicPredictorDraft}
                onChange={(event) => setTopicPredictorDraft(event.target.value)}
                className="h-[260px] w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            ) : (
              <div className="app-ui-content prose prose-sm max-w-none text-slate-700">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{topicPredictorDraft}</ReactMarkdown>
              </div>
            )
          ) : (
            <p className="text-sm text-slate-500">Run forecast analysis first, then optionally edit the full text output here.</p>
          )}
        </div>
      </DraggableWindow>

      {dockWindows.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-50 hidden -translate-x-1/2 md:block">
          <div className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 shadow-xl backdrop-blur">
            {dockWindows.map((windowState) => {
              const { icon: DockIcon, label } = windowMeta[windowState.id];
              const isFocused = desktopState.focusedId === windowState.id && !windowState.isMinimized;

              return (
                <button
                  key={windowState.id}
                  type="button"
                  onClick={() => {
                    if (windowState.isMinimized) {
                      openWindow(windowState.id);
                      return;
                    }

                    dispatchDesktop({ type: "MINIMIZE_WINDOW", id: windowState.id });
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    isFocused
                      ? "bg-indigo-50 text-indigo-600"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <DockIcon size={14} /> {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
