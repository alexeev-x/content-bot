import type { PostDto, PublicationDto } from '@alexeev/contracts';
import type { CalendarData } from '../api/calendar-api';

export type CalendarEvent = {
  id: string;
  kind: 'publication' | 'post';
  title: string;
  status: PublicationDto['status'] | PostDto['status'];
  at: string | null;
  destinationId?: string;
  destinationTitle?: string;
  postId?: string;
  publication?: PublicationDto;
  post?: PostDto;
};

export function calendarEvents(data: CalendarData, destinationId?: string): CalendarEvent[] {
  const destinations = new Map(data.destinations.map((destination) => [destination.id, destination]));
  const posts = new Map(data.posts.map((post) => [post.id, post]));
  const publications = data.publications
    .filter((publication) => !destinationId || publication.destinationId === destinationId)
    .map((publication): CalendarEvent => ({
      id: publication.id,
      kind: 'publication',
      title: posts.get(publication.postId)?.title || 'Пост без названия',
      status: publication.status,
      at: publication.scheduledAt,
      destinationId: publication.destinationId,
      destinationTitle: destinations.get(publication.destinationId)?.title ?? 'Канал',
      postId: publication.postId,
      publication
    }));
  const unscheduled = data.unscheduledPosts.map((post): CalendarEvent => ({
    id: post.id,
    kind: 'post',
    title: post.title || 'Пост без названия',
    status: post.status,
    at: null,
    post
  }));
  return [...publications, ...unscheduled];
}
