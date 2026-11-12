const awardIntervalSchema = {
  type: 'object',
  properties: {
    producer: { type: 'string' },
    interval: { type: 'integer' },
    previousWin: { type: 'integer' },
    followingWin: { type: 'integer' },
  },
  required: ['producer', 'interval', 'previousWin', 'followingWin'],
} as const;

export const awardIntervalsSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        min: { type: 'array', items: awardIntervalSchema },
        max: { type: 'array', items: awardIntervalSchema },
      },
      required: ['min', 'max'],
    },
  },
} as const;
