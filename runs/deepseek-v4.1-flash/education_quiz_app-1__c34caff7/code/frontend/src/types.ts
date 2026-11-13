export type Option = "A" | "B" | "C" | "D";

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface QuizQuestion {
  id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface Question extends QuizQuestion {
  correct_option: Option;
}

export interface AnswerReview {
  question_id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  selected: Option;
  correct_option: Option;
  is_correct: boolean;
}

export interface Attempt {
  id: number | null;
  score: number;
  correct: number;
  total_questions: number;
  submitted_at: string;
  answers: AnswerReview[];
}

export interface AttemptAnswerInput {
  question_id: number;
  selected: Option;
}

export interface QuestionInput {
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: Option;
}

export interface PaginatedQuestions {
  items: Question[];
  total: number;
  page: number;
  page_size: number;
}

export const OPTION_KEYS: Option[] = ["A", "B", "C", "D"];

type OptionFields = {
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};

export function optionText(question: OptionFields, option: Option): string {
  return question[`option_${option.toLowerCase()}` as keyof OptionFields];
}
