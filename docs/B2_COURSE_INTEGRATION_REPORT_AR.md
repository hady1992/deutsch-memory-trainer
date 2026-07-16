# تقرير دمج B2 Kurs

## نطاق الفحص

تم فحص `README_INTEGRATION_AR.md` و`QUALITY_REPORT_AR.md` وملفات الوحدات 1 و2 و3 داخل الحزمة، ثم تمت مقارنة هويات المفردات مع ملفات الإنتاج الخمسة من دون تعديلها أو تغيير أي ID قديم.

| الوحدة | مفردات الحزمة | تمارين | جديدة | مرتبطة ببيانات الإنتاج | مراجع لوحدات سابقة |
|---|---:|---:|---:|---:|---:|
| 1 | 60 | 28 | 45 | 15 | 0 |
| 2 | 76 | 41 | 57 | 19 | 9 |
| 3 | 70 | 42 | 58 | 12 | 9 |
| المجموع | 206 | 111 | 160 | 46 | 18 |

## العناصر الموجودة سابقًا

لم تُنشأ IDs إنتاجية جديدة للعناصر الـ46 الموجودة مسبقًا. احتفظ كل عنصر بمعرف الكورس، وربط بالحقل `globalRef` إلى الـID الإنتاجي القديم. بهذه الطريقة تبقى شروحات وأمثلة الوحدة متاحة من دون إدخال نسخة جديدة في ملفات الإنتاج.

### الوحدة 1

- `b2u01-v003` Umzugskarton -> `nouns:noun_0023`
- `b2u01-v004` Angebot -> `nouns:noun_0133`
- `b2u01-v005` Besichtigungstermin -> `nouns:noun_0025`
- `b2u01-v009` Einbauküche -> `nouns:noun_0014`
- `b2u01-v013` Kaution -> `nouns:noun_0024`
- `b2u01-v014` Grundriss -> `nouns:noun_0010`
- `b2u01-v015` Hausverwaltung -> `nouns:noun_0018`
- `b2u01-v023` Gewerberaum -> `nouns:noun_0029`
- `b2u01-v027` Ruhezeit -> `nouns:noun_0420`
- `b2u01-v029` Mangel -> `nouns:noun_0359`
- `b2u01-v031` umziehen -> `verbs:209`
- `b2u01-v046` ausgebucht -> `adjectives:adj_0002`
- `b2u01-v047` flexibel -> `adjectives:adj_0001`
- `b2u01-v051` ein Angebot einholen -> `phrases:phrase_0009`
- `b2u01-v060` die Daumen drücken -> `phrases:phrase_0004`

### الوحدة 2

- `b2u02-v002` Warenangebot -> `nouns:noun_0052`
- `b2u02-v005` Gleitzeit -> `nouns:noun_0377`
- `b2u02-v007` Buchführung -> `nouns:noun_0060`
- `b2u02-v011` Pachtvertrag -> `nouns:noun_0061`
- `b2u02-v012` Sortiment -> `nouns:noun_0062`
- `b2u02-v017` Kredit -> `nouns:noun_0066`
- `b2u02-v022` Gewerbefläche -> `nouns:noun_0067`
- `b2u02-v023` Dienstplan -> `nouns:noun_0071`
- `b2u02-v030` Diskriminierung -> `nouns:noun_0414`
- `b2u02-v032` Betriebsrat -> `nouns:noun_0399`
- `b2u02-v036` Kündigungsfrist -> `nouns:noun_0166`
- `b2u02-v040` Gewerkschaft -> `nouns:noun_0168`
- `b2u02-v042` Nebentätigkeit -> `nouns:noun_0400`
- `b2u02-v052` Kundenbeschwerde -> `nouns:noun_0487`
- `b2u02-v055` Reklamation -> `nouns:noun_0430`
- `b2u02-v056` freiberuflich -> `adjectives:adj_0005`
- `b2u02-v057` selbstständig -> `adjectives:adj_0004`
- `b2u02-v063` einen Kiosk betreiben -> `phrases:phrase_0025`
- `b2u02-v075` zur Verfügung stehen -> `phrases:phrase_0057`

### الوحدة 3

- `b2u03-v001` Teamarbeit -> `nouns:noun_0073`
- `b2u03-v006` Absprache -> `nouns:noun_0077`
- `b2u03-v007` Verbesserungsvorschlag -> `nouns:noun_0079`
- `b2u03-v010` Gerücht -> `nouns:noun_0081`
- `b2u03-v017` Protokoll -> `nouns:noun_0092`
- `b2u03-v024` Aushilfskraft -> `nouns:noun_0100`
- `b2u03-v031` systematisch -> `adjectives:adj_0017`
- `b2u03-v032` konstruktiv -> `adjectives:adj_0022`
- `b2u03-v038` souverän -> `adjectives:adj_0009`
- `b2u03-v039` überfordert -> `adjectives:adj_0011`
- `b2u03-v040` unvoreingenommen -> `adjectives:adj_0010`
- `b2u03-v063` die Realität aus den Augen verlieren -> `phrases:phrase_0046`

## نتائج البنية والمحتوى

- IDs المفردات المكررة: 0.
- IDs التمارين المكررة: 0.
- هويات B2 الداخلية المكررة: 0.
- المراجع غير القابلة للحل: 0.
- التكرارات المحتملة مع الإنتاج: 0.
- الإجابات الناقصة من خيارات الاختيار: 0.
- أمثلة ألمانية أو عربية ناقصة: 0.
- أنواع التمارين الموجودة والمدعومة: 11 من 11.

الأسماء التي لا تملك صيغة جمع بسبب كونها جمعية أو غير معدودة أو مستعملة غالبًا بالمفرد تحمل `numberType` صريحًا، لذلك لا تُعامل كبيانات ناقصة. لم يظهر خطأ لغوي مانع للدمج الآلي، مع بقاء المراجعة البشرية الدورية مستحسنة للمحتوى التعليمي.

## مشكلات الحزمة التي عولجت

- كانت ملفات التمارين تقترح المفتاح `dmt_b2_course_progress` بدل المفتاح المعتمد؛ تم توحيدها على `dmt_b2_course_progress_v1`.
- كانت تمارين الكتابة والكلام تُسجل كإجابة صحيحة تلقائيًا؛ أصبحت تستخدم قائمة تقييم ذاتي وخياري «أنجزت» و«أحتاج مراجعة» من دون زيادة `correctCount` تلقائيًا.
- تمت إضافة تدقيق يمنع تكرار IDs والهويات والمراجع، ويرفض عنصر إنتاج موجودًا إذا لم يرتبط بالـID القديم.

## إضافة وحدة لاحقة

يُنفذ التحقق الكامل أولًا من دون كتابة أي ملف:

```powershell
npm.cmd run course:add -- --unit 4 --title-de "Tourismus" --title-ar "السياحة" --pages-from 61 --pages-to 80 --vocabulary unit-04-vocabulary.json --exercises unit-04-exercises.json --dry-run
```

بعد نجاح المعاينة، يُعاد الأمر من دون `--dry-run`. لا يمكن استبدال وحدة موجودة إلا بإضافة `--replace` صراحة. وإذا فشل التدقيق بعد التطبيق، تعيد الأداة ملفات الوحدة والـmanifest إلى حالتها السابقة. لا تقرأ الأداة تقدم المستخدم ولا تكتبه.
