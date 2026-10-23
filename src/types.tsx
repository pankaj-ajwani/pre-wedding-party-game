export type GameState = {
  status: 'LOBBY' | 'QUESTION_SHOW' | 'VOTING_OPEN' | 'VOTING_CLOSED' | 'REVEAL' | 'GAME_OVER'
  currentQuestionIndex: number
  questions: Question[]
  players: Record<string, Player>
  votes: Record<string, VoteSet>
  coupleChoices: Record<string, CoupleChoice>
  groomName: string
  brideName: string
}

type Question = {
  id: string
  text: string
}

type Player = {
  name: string
  role: PlayerRole
  score: number
}

export type PlayerRole = 'GUEST' | 'BRIDE' | 'GROOM'

type VoteSet = Record<string, VoteChoice>

export type VoteChoice = 'Bride' | 'Groom'

type CoupleChoice = {
  groomChoice: string
  brideChoice: string
}
