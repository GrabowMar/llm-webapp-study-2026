export type OptionKey = "A" | "B" | "C" | "D";

export interface QuizQuestion {
  id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface Question extends QuizQuestion {
  correct_option: OptionKey;
}

export interface ReviewAnswer extends QuizQuestion {
  question_id: number;
  correct_option: OptionKey;
  selected: OptionKey;
  is_correct: boolean;
}

export interface Attempt {
  id: number | null;
  score: number;
  correct: number;
  total_questions: number;
  submitted_at: string;
  answers: ReviewAnswer[];
}

export interface QuestionPage {
  items: Question[];
  total: number;
  page: number;
  page_size: number;
}

export interface NewQuestion {
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: OptionKey;
}

export interface AnswerInput {
  question_id: number;
  selected: OptionKey;
}
