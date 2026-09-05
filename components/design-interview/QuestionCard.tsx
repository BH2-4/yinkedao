"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import type {
  InterviewAnswers,
  InterviewQuestionId,
} from "@/lib/design-interview/intent-types";
import type { InterviewQuestion } from "@/lib/design-interview/engine";

type Props = {
  question: InterviewQuestion;
  /** 当前题在流程中的序号（1-based） */
  step: number;
  answers: InterviewAnswers;
  /** 本维度自由文本补充（可选，实时保存） */
  note: string;
  onNoteChange: (text: string) => void;
  onAnswer: (id: InterviewQuestionId, value: string[]) => void;
  onSkip: (id: InterviewQuestionId) => void;
  onBack: () => void;
  canBack: boolean;
};

/**
 * 单题渲染器：
 *  - 单选：点选即确认，立即进入下一题（零额外点击）
 *  - 多选：卡片可切换，底部确认按钮提交（显示已选计数）
 *  - 任意题可跳过；「还没想好」类探索选项由题库 hasExploreOption 标记
 * 文案全部来自 messages/*.json 的 interview.questions 段。
 */
export function QuestionCard({
  question,
  step,
  answers,
  note,
  onNoteChange,
  onAnswer,
  onSkip,
  onBack,
  canBack,
}: Props) {
  const { t } = useI18n();
  const isMulti = question.mode === "multiple";
  /* 切题重置由父级 key={currentId} 重挂载完成（无 effect、无级联渲染） */
  const [pending, setPending] = useState<string[]>([]);

  const answered = answers[question.id];
  const maxSelect = question.maxSelect ?? 1;
  const qKey = `interview.questions.${question.id}`;

  const selectSingle = (optionId: string) => {
    onAnswer(question.id, [optionId]);
  };

  const toggleMulti = (optionId: string) => {
    setPending((prev) => {
      if (prev.includes(optionId)) return prev.filter((id) => id !== optionId);
      if (prev.length >= maxSelect) return prev;
      return [...prev, optionId];
    });
  };

  const optionLabel = (optionId: string): string =>
    t(`${qKey}.options.${optionId}.label`);

  /** hint 缺失时 translate 返回 key 本身 → 不渲染 */
  const optionHint = (optionId: string): string | undefined => {
    const key = `${qKey}.options.${optionId}.hint`;
    const hint = t(key);
    return hint === key ? undefined : hint;
  };

  const title = t(`${qKey}.title`);
  const subtitleKey = `${qKey}.subtitle`;
  const subtitle = t(subtitleKey);
  const hasSubtitle = subtitle !== subtitleKey;

  return (
    <section
      className="animate-fade-in flex flex-col gap-9"
      aria-label={t("interview.questionLabel", { step })}
    >
      <div className="flex flex-col gap-2">
        <span className="stage-index">
          {t("interview.questionLabel", { step })}
        </span>
        <h2 className="act-title max-w-2xl">{title}</h2>
        {hasSubtitle && (
          <p className="act-body mt-1 max-w-lg">{subtitle}</p>
        )}
      </div>

      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        role={isMulti ? "group" : "radiogroup"}
        aria-label={title}
      >
        {question.options.map((option) => {
          const selected = isMulti
            ? pending.includes(option.id)
            : answered?.includes(option.id) === true;
          const hint = optionHint(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isMulti ? selected : undefined}
              onClick={() =>
                isMulti ? toggleMulti(option.id) : selectSingle(option.id)
              }
              className={`flex flex-col gap-2 rounded-[2px] border p-5 text-left transition-all duration-500 ${selected
                  ? "border-[rgba(245,245,247,0.38)] bg-[rgba(245,245,247,0.05)] shadow-[0_1px_0_0_rgba(245,245,247,0.22)]"
                  : "border-[var(--color-line)] bg-transparent hover:border-[rgba(245,245,247,0.22)] hover:bg-[rgba(245,245,247,0.03)]"
                }`}
            >
              <span className="flex items-center gap-2 text-[14px] tracking-[0.01em] text-[var(--color-silver-100)]">
                {isMulti && selected && (
                  <Check
                    className="h-3.5 w-3.5 text-[var(--color-silver-200)]"
                    strokeWidth={1.5}
                  />
                )}
                {optionLabel(option.id)}
              </span>
              {hint && (
                <span className="text-[12px] leading-relaxed text-[var(--color-silver-500)]">
                  {hint}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 每维度补充输入（可选）——自由文本，实时保存 */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor={`note-${question.id}`}
          className="font-mono text-[11px] tracking-[0.16em] text-[var(--color-silver-600)] uppercase"
        >
          {t("interview.noteLabel")}
        </label>
        <input
          id={`note-${question.id}`}
          type="text"
          value={note}
          maxLength={60}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={t("interview.notePlaceholder")}
          className="w-full max-w-md rounded-[2px] border border-[var(--color-line)] bg-transparent px-4 py-2.5 text-[13px] text-[var(--color-silver-200)] outline-none transition-colors duration-300 placeholder:text-[var(--color-silver-600)] focus:border-[rgba(245,245,247,0.28)]"
        />
      </div>

      {isMulti && (
        <div className="flex items-center gap-4">
          <span className="font-mono text-[12px] tracking-[0.14em] text-[var(--color-silver-400)]">
            {t("interview.selectedCount", {
              count: pending.length,
              max: maxSelect,
            })}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            disabled={pending.length === 0}
            onClick={() => onAnswer(question.id, pending)}
            className="rounded-[2px] border border-[var(--color-ivory)] bg-[var(--color-ivory)] px-6 py-2.5 text-[12px] font-medium tracking-[0.18em] text-[var(--color-bg)] uppercase transition-all duration-300 hover:bg-[var(--color-silver-200)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("interview.confirm")}
          </button>
        </div>
      )}

      <div className="flex items-center gap-5 border-t border-[var(--color-line)] pt-6">
        {canBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-[12px] tracking-[0.14em] text-[var(--color-silver-400)] uppercase transition-colors duration-200 hover:text-[var(--color-silver-200)]"
          >
            {t("interview.back")}
          </button>
        ) : (
          <span />
        )}
        <span className="flex-1" />
        <span className="text-[12px] text-[var(--color-silver-600)]">
          {t("interview.skipHint")}
        </span>
        <button
          type="button"
          onClick={() => onSkip(question.id)}
          className="rounded-[2px] border border-[var(--color-line)] px-5 py-2 text-[12px] tracking-[0.18em] text-[var(--color-silver-400)] uppercase transition-all duration-300 hover:border-[rgba(245,245,247,0.22)] hover:text-[var(--color-silver-200)]"
        >
          {t("interview.skip")}
        </button>
      </div>
    </section>
  );
}
