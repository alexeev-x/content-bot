import { type RubricSampleKey, sendRubricSampleResponseSchema } from '@alexeev/contracts';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '../../../shared/api/http-client';

/** «Тестирование» (DEV builds only): one rubric's post from live data goes to the owner's chat with the bot. */
export function sendRubricSample(rubric: RubricSampleKey) {
  return apiRequest('/api/v1/lab/rubrics', sendRubricSampleResponseSchema, { method: 'POST', body: { rubric } });
}

export function useSendRubricSample() {
  return useMutation({ mutationFn: sendRubricSample, retry: false });
}
