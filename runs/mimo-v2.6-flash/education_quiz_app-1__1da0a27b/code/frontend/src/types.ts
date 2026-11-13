export type OptionLetter = "A" | "B" | "C" | "D";

export interface QuizQuestion {
  id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface Question extends QuizQuestion {
  correct_option: OptionLetter;
}

export interface AnswerReview {
  question_id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  selected: OptionLetter;
  correct_option: OptionLetter;
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

export interface User {
  username: string;
  is_admin: boolean;
}

export interface QuestionPage {
  items: Question[];
  total: number;
  page: number;
  page_size: number;
}
