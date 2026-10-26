import assert from 'node:assert/strict';
import {academyLessons} from '../src/tutorialAcademy.ts';
import {FORUM_TUTORIALS,tutorialSourcesForLesson} from '../src/forumTutorials.ts';
const ids=new Set();const lessons=new Set(academyLessons.map(l=>l.id));
for(const t of FORUM_TUTORIALS){
  assert.ok(!ids.has(t.id));ids.add(t.id);
  assert.ok(t.author.trim().length>2&&t.title.trim().length>5);
  assert.match(t.url,/^https:\/\//);assert.equal(t.confidence,'indexedWithAuthor');
  for(const id of t.lessons)assert.ok(lessons.has(id));
}
assert(tutorialSourcesForLesson('multiplayerWorkshop').some(t=>t.author==='Xzzy'));
assert(tutorialSourcesForLesson('caves').some(t=>t.author==='EViLDaVE'));
assert(tutorialSourcesForLesson('campaign').some(t=>t.author==='MattDratt'));
console.log(`PASS: ${FORUM_TUTORIALS.length} author-attributed, HTTPS-linked archived tutorials, mapped to active lessons`);
