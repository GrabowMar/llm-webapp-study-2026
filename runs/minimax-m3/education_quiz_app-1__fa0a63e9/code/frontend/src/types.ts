export interface Question {
  id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option?: string;
}

export interface QuizItem {
  id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface AttemptAnswer {
  question_id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  selected: string;
  correct_option: string;
  is_correct: boolean;
}

export interface Attempt {
  id: number;
  score: number;
  correct: number;
  total_questions: number;
  submitted_at: string;
  answers: AttemptAnswer[];
}

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
}
