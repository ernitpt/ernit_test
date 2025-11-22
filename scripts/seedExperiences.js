// README: run with  node scripts/seedExperiences.js
// required:  npm install firebase-admin

import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert } from "firebase-admin/app";

const SERVICE_ACCOUNT_KEY = defineSecret("SERVICE_ACCOUNT_KEY");

// Initialize Firebase Admin
initializeApp({
  credential: cert(SERVICE_ACCOUNT_KEY),
});

const db = getFirestore();

const experiences = [
  // Adventure
  {
    id: "adv1",
    partnerId: "E3O5zKbxDZa5JN1eK3EUv2SGtW52",
    title: "Bouldering Class",
    subtitle: "Escala25, Lisbon",
    description:
      "A great reward for someone who loves a challenge or wants to step out of their comfort zone. "
      + "This beginner-friendly climbing session at Escala25, right under Lisbon’s iconic bridge, "
      + "introduces the basics of climbing: safety, movement, and the joy of reaching new heights.\n\n"
      + "📍 Location: Escala25, Lisbon\n⏱ Duration: Around 1.5 hours\n👥 Includes: All equipment and guidance from certified instructors\n💙 Perfect for: First-timers or anyone ready to feel empowered through movement.\n\n"
      + "An experience that builds confidence, strength, and the thrill of achieving something new.",
    category: "adventure",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Findoor%20climbing%2Findoor_climb_1.jpg?alt=media&token=aab8eb39-5c25-4f50-a61f-e91577206d6d",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Findoor%20climbing%2Findoor_climb_2.jpg?alt=media&token=897f0edf-0f27-4cef-a53e-9a074058f5e3"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Findoor%20climbing%2Findoor_climb_1.jpg?alt=media&token=aab8eb39-5c25-4f50-a61f-e91577206d6d",
    price: 30,
    createdAt: new Date(),
  },
  {
    id: "adv2",
    partnerId: "dmvViyovUnby8vtxx105llFulU62",
    title: "Surf Lesson",
    subtitle: "Better Ride Surf School, Carcavelos",
    description:
      "Give someone the feeling of freedom that only the ocean can bring. "
      + "With Better Ride Surf School, your loved one will celebrate their achievement by learning to catch their first wave at Carcavelos Beach — "
      + "one of Lisbon’s most iconic surf spots. A certified instructor will guide them through the basics in a safe, energizing, and joy-filled session.\n\n"
      + "🕒 Duration: Around 1.5 to 2 hours\n🧭 Includes: Instructor, surfboard, wetsuit, and all materials\n💙 Perfect for: Celebrating progress, courage, and persistence.",
    category: "adventure",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2FBetter%20Ride%20Surf%20School%2F2024-11-07.jpg?alt=media&token=c40b922b-f277-4b9c-bfea-c316e36f4f28",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2FBetter%20Ride%20Surf%20School%2F2024-11-207.jpg?alt=media&token=80b7ae7a-fb2d-439c-be7b-74ea737d3610",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2FBetter%20Ride%20Surf%20School%2Fsurf-2103123_1920.jpg?alt=media&token=5b8d16e3-a4c9-46bc-b7e1-2aeb4b567245"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2FBetter%20Ride%20Surf%20School%2Fsurf-2103123_1920.jpg?alt=media&token=5b8d16e3-a4c9-46bc-b7e1-2aeb4b567245",
    price: 35,
    createdAt: new Date(),
  },
  {
    id: "adv3",
    partnerId: "YPmHH5uVdgdukobTZFqNjpEFfKo1",
    title: "Boat Tour",
    subtitle: "Vertente Natural, Sesimbra",
    description:
      "Gift a sense of discovery and peace. This guided boat trip explores the quiet beauty of Arrábida’s coastal bays: limestone cliffs, emerald waters, and beaches only reachable by sea.\n\n"
      + "📍 Location: Arrábida Coast (Sesimbra)\n⏱ Duration: 2–3 hours\n🧭 Includes: Skipper, safety gear, insurance, and coastal magic.",
    category: "adventure",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fboat%20tour%2Fboat_3.jpg?alt=media&token=87b6ae76-3b7a-4ddb-a1a5-ace3830c37fe",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fboat%20tour%2Fboat_1.jpg?alt=media&token=f4dba4fd-6822-4a9b-9bf9-822a26830490",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fboat%20tour%2Fboat_2.jpg?alt=media&token=cee9f614-a548-4fb8-851b-88e90817c57e"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fboat%20tour%2Fboat_3.jpg?alt=media&token=87b6ae76-3b7a-4ddb-a1a5-ace3830c37fe",
    price: 35,
    createdAt: new Date(),
  },
  {
    id: "adv4",
    partnerId: "YPmHH5uVdgdukobTZFqNjpEFfKo1",
    title: "Kayak Tour",
    subtitle: "Vertente Natural, Sesimbra",
    description:
      "A calm yet energizing way to reward persistence and balance. On this guided kayaking journey, "
      + "participants paddle along crystal-clear waters, explore hidden caves, and rest on small deserted beaches.\n\n"
      + "📍 Location: Portinho da Arrábida\n⏱ Duration: Around 3 hours\n🧭 Includes: Kayak, paddle, life jacket, guide, insurance, and photos.",
    category: "adventure",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fkayak%20tour%2Fkayak_2.jpg?alt=media&token=d8588efe-13c3-4734-9b15-722fc8455833",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fkayak%20tour%2Fkayak_1.jpg?alt=media&token=0d2403bf-2edd-4871-8719-2ab1ccb289a7",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fkayak%20tour%2Fkayak_3.jfif?alt=media&token=81c4c4c0-9a5a-4eea-ad7f-ed3e276f964e"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fkayak%20tour%2Fkayak_2.jpg?alt=media&token=d8588efe-13c3-4734-9b15-722fc8455833",
    price: 35,
    createdAt: new Date(),
  },
  {
    id: "adv5",
    partnerId: "E3O5zKbxDZa5JN1eK3EUv2SGtW52",
    title: "Outdoor Climbing",
    subtitle: "Escala25, Lisbon",
    description:
      "The perfect gift for an explorer at heart. This half-day outdoor adventure with Escala25 takes climbing to nature: beautiful cliffs, sea views, and the satisfaction of testing limits.\n\n"
      + "📍 Location: Natural climbing areas near Lisbon\n⏱ Duration: Around 4 hours\n👥 Includes: All equipment, transport, and professional guidance\n💙 Perfect for: Those who love nature, physical challenge, and unforgettable views.",
    category: "adventure",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Foutdoor%20climbing%2F472863729_583387610960564_5005275641004927776_n.jpg?alt=media&token=08dcaf61-67ac-4b00-aba5-f757cf5b5dfc",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Foutdoor%20climbing%2FGPENAUD-CLIMBING-PEDRA-AMARELA-22-768x512.jpg?alt=media&token=b6423f2f-0ffa-4c11-9cb7-6b4fe611e27d",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Foutdoor%20climbing%2FGPENAUD-CLIMBING-PEDRA-AMARELA-7-768x512.jpg?alt=media&token=78386174-807e-45b2-9b63-354d0b4e9d59"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Foutdoor%20climbing%2FGPENAUD-CLIMBING-PEDRA-AMARELA-7-768x512.jpg?alt=media&token=78386174-807e-45b2-9b63-354d0b4e9d59",
    price: 40,
    createdAt: new Date(),
  },
  {
    id: "adv6",
    partnerId: "YPmHH5uVdgdukobTZFqNjpEFfKo1",
    title: "Coasteering",
    subtitle: "Vertente Natural, Sesimbra",
    description:
      "Reward someone who’s ready to, quite literally, leap. "
      + "This experience combines hiking, swimming, climbing, and cliff-jumping along the wild coastline of Arrábida.\n\n"
      + "📍 Location: Sesimbra / Arrábida Coast\n⏱ Duration: 3–4 hours\n🧭 Includes: Professional guide, equipment, insurance, and stunning views.",
    category: "adventure",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fcoastering%2Fcoast_2.jpg?alt=media&token=d4f2e71c-3bca-4fe3-911d-f3fbca635737",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fcoastering%2Fcoast_6.jpg?alt=media&token=38d7852f-4acd-431b-81fc-4fc6f7043825",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fcoastering%2Fcoast_1.jpg?alt=media&token=1cdd729f-b14f-4c25-9d20-aa9a212f54f6",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fcoastering%2Fcoast_3.jpg?alt=media&token=60003dc3-a1ba-4fa1-8f9e-b63286a6674c",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fcoastering%2Fcoast_4.jpg?alt=media&token=ffe62e2d-f7a7-4dd3-b990-cb7d1065bf57",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fcoastering%2Fcoast_5.jpg?alt=media&token=c4c6ffd1-ce66-4504-88c7-b7217ecd4d9d"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fcoastering%2Fcoast_2.jpg?alt=media&token=d4f2e71c-3bca-4fe3-911d-f3fbca635737",
    price: 45,
    createdAt: new Date(),
  },
  {
    id: "adv7",
    partnerId: "YPmHH5uVdgdukobTZFqNjpEFfKo1",
    title: "Dolphins Observation",
    subtitle: "Vertente Natural, Sesimbra",
    description:
      "Sometimes, the best reward is pure awe. "
      + "This experience invites participants to witness dolphins swimming freely along Arrábida’s coastline, "
      + "guided by a marine expert sharing stories about these creatures and their habitat.\n\n"
      + "📍 Location: Arrábida / Sesimbra\n⏱ Duration: 2–3 hours\n🧭 Includes: Boat tour, guide, and insurance.",
    category: "adventure",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fdolphins%20observation%2Fdolphins_1.jpeg?alt=media&token=798e022d-5563-4921-91f8-b2e403c11b47"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fdolphins%20observation%2Fdolphins_1.jpeg?alt=media&token=798e022d-5563-4921-91f8-b2e403c11b47",
    price: 50,
    createdAt: new Date(),
  },
  {
    id: "adv8",
    partnerId: "YPmHH5uVdgdukobTZFqNjpEFfKo1",
    title: "Diving Baptism",
    subtitle: "Vertente Natural, Sesimbra",
    description:
      "A true transformation reward for someone ready to explore new depths. "
      + "This diving baptism introduces participants to the underwater world of the Arrábida Marine Park with a certified instructor.\n\n"
      + "📍 Location: Arrábida Marine Park\n⏱ Duration: Around 3 hours\n🧭 Includes: Full diving equipment, instructor, insurance, and underwater memories.",
    category: "adventure",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fdiving%20baptism%2FBatismo-de-Mergulho-4-.jpg?alt=media&token=b54abd20-816f-4734-9350-8e8a5bd88296",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fdiving%20baptism%2FBatismo-de-Mergulho-1.jpg?alt=media&token=5e4617ea-631e-4ece-a7e8-ee4418c33364",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fdiving%20baptism%2FBatismo-de-Mergulho-2.jpg?alt=media&token=9866c2cc-fcc8-4d32-8d10-d22a1c146395"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fdiving%20baptism%2FBatismo-de-Mergulho-4-.jpg?alt=media&token=b54abd20-816f-4734-9350-8e8a5bd88296",
    price: 110,
    createdAt: new Date(),
  },
  {
    id: "adv9",
    partnerId: "lshg0cMtfyPg0y3CmUwFjUjX5ws1",
    title: "Tandem Jump (3000m)",
    subtitle: "Skydive, Évora",
    description:
      "Give someone the gift of sky-high achievement. "
      + "With Skydive Portugal’s Pack Silver, enjoy a scenic flight over Évora followed by a tandem jump from ~3000m, "
      + "free-falling at ~200 km/h before floating gently under the parachute.\n\n"
      + "📍 Location: Aeródromo de Évora, Alentejo\n💶 Price: €139 (Pack Silver)\n💥 Includes: ~10 min scenic flight, ~20 sec free fall, ~5 min parachute ride\n💙 Perfect for: Those who love adrenaline and celebrating life milestones.",
    category: "adventure",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fskydive%2Fskydiving-evora-1050x525.webp?alt=media&token=8a4c4c7a-bd13-4688-87a9-c3c2bfa78c95",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fskydive%2FSaltos-de-Paraquedas-1.webp?alt=media&token=416c4819-5ed7-49a3-9e14-486420f2c7e6",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fskydive%2Fsaltar-de-paraquedas-skydive-portugal.jpg?alt=media&token=deea8ead-504b-47af-b197-662538944571"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fadventure%2Fskydive%2Fskydiving-evora-1050x525.webp?alt=media&token=8a4c4c7a-bd13-4688-87a9-c3c2bfa78c95",
    price: 139,
    createdAt: new Date(),
  },
  // Wellness 
  {
    id: "wel1",
    partnerId: "FLlCQsFCUhYge7501IqtE2tLUbH3",
    title: "Sound Healing",
    subtitle: "Little Yoga Space, Lisboa",
    description:
      "Gift someone a moment of pure inner harmony. "
      + "In this 90-minute group session, the participant relaxes while surrounded by Tibetan bowls, gongs, and other meditative instruments.\n\n"
      + "✨ Highlights:\nPurpose: Harmonize body, mind, and emotions through sound frequencies.\nFocus: Deep relaxation, energy release, and inner balance.\nBonus: Includes a small mandala as a symbolic gift.\n💙 Perfect for: Someone who needs to slow down and reconnect.",
    category: "relaxation",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Fsound%20healing%2Fsound_2.JPG?alt=media&token=0af02822-3980-4a1d-88a3-374a77af645d",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Fsound%20healing%2Fsound_1.jpeg?alt=media&token=b68f1057-37d1-4a9c-876c-ad899f826d43",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Fsound%20healing%2Fsound_3.jpg?alt=media&token=0dc23c1b-d569-4e69-afda-318940324c56",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Fsound%20healing%2Fsound_4.jpg?alt=media&token=0fb15ed7-64c1-4ecd-a11e-ff5952bd16a0",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Fsound%20healing%2Fsound_5.JPG?alt=media&token=1f62d2f8-8002-41ea-bf8f-8a1d369c19df"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Fsound%20healing%2Fsound_5.JPG?alt=media&token=1f62d2f8-8002-41ea-bf8f-8a1d369c19df",
    price: 25,
    createdAt: new Date(),
  },
  {
    id: "wel2",
    partnerId: "ION490slREPpWJNNKvb5RRtuq033",
    title: "Therapeutic / Sports Massage",
    subtitle: "Muscura Aura, Lisbon",
    description:
      "A personalized treatment for full-body recovery — choose between a Therapeutic Sports Massage for deep relief or a Relaxation Massage for calm and re-ease.\n\n"
      + "👐 Techniques: Shiatsu, Thai massage, trigger point therapy\n⏱ Duration: 50 minutes\n💙 Perfect for: Anyone who’s been active, focused, or needs deep care.",
    category: "relaxation",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Frelax%20massage%2Fmassage_1.jpg?alt=media&token=d7fbd268-ed5e-49d7-a0ea-2a7e504993f0",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Frelax%20massage%2Fmassage_2.jpg?alt=media&token=abc1d287-3eae-47be-9f80-4c7ece94f930"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Frelax%20massage%2Fmassage_1.jpg?alt=media&token=d7fbd268-ed5e-49d7-a0ea-2a7e504993f0",
    price: 45,
    createdAt: new Date(),
  },
  {
    id: "wel3",
    partnerId: "k5pdHPrb1jd9KZ6AdK6CeslW9Ve2",
    title: "Breathwork Ceremony",
    subtitle: "Little Yoga Space, Lisbon",
    description:
      "A nurturing and deeply restorative reward for someone who needs to reconnect with their body, unwind tension, and feel truly cared for.\n\n"
      + "In this personalized treatment, the recipient is welcomed into a calm and supportive environment where they can release physical stress, soften tightness, and rediscover a sense of comfort and ease within themselves.\n\n"
      + "Through a tailored blend of Therapeutic Sports Massage or Relaxation Massage, combined with techniques such as Shiatsu, Thai-inspired stretching, and trigger point therapy, the session becomes more than bodywork — it becomes a grounding journey back into balance, presence, and inner calm.\n\n"
      + "It’s the perfect gift for someone who has been active, focused, or pushing themselves, and deserves a moment to be held, supported, and fully rejuvenated.\n\n"
      + "⏱ Duration: 50 minutes\n"
      + "🧭 Includes: Personalized massage treatment, targeted muscle relief, relaxation techniques, and guided unwinding for full-body recovery\n"
      + "💙 Ideal for: Athletes, busy minds, or anyone needing deep care and renewal.",
    category: "relaxation",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Fbreathworth%2FFire-Module-22.jpg?alt=media&token=1c2a927e-a4e0-4763-a985-07490770424c",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Fbreathworth%2Fmela-breathwork_1.jpeg?alt=media&token=915edfe9-45e2-4959-bbac-3ed613a690d3"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fwellness%2Fbreathworth%2FIMG_00501.jpg?alt=media&token=f1de3171-aac2-43d9-97ca-fac7f1da22b9",
    price: 45,
    createdAt: new Date(),
  },
  // Creative
  {
    id: "cre1",
    partnerId: "j368pTfYsiUYfOS1oWxnioigg3g1",
    title: "Ceramics Workshop",
    subtitle: "Clay Club, Lisbon",
    description:
      "A 2-hour hands-on session at Clay Club (SAFRA) where participants shape and paint their own clay piece under expert guidance.\n\n"
      + "📍 Location: SAFRA, Lisbon\n⏱ Duration: 2 hours\nIncludes: All materials, glazing, and firing.\n💙 Perfect for: Someone who loves mindful creativity and keepsakes.",
    category: "creative",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2FClay%20Clube%2Fclay_1.jpg?alt=media&token=471e1e09-06e7-406f-8841-1b3caa6587aa",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2FClay%20Clube%2Fclay_2.jpg?alt=media&token=0d82445e-4dee-4dd4-9ac7-b12adaad05b1"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2FClay%20Clube%2Fclay_1.jpg?alt=media&token=471e1e09-06e7-406f-8841-1b3caa6587aa",
    price: 15,
    createdAt: new Date(),
  },
  {
    id: "cre2",
    partnerId: "tpTn7qsRMwTKe9gr28GR5Br7UtG2",
    title: "Brunch & Ceramics Workshop",
    subtitle: "Casa Angelita, Lisbon",
    description:
      "A morning blend of art and comfort — shape your own pinch-pot clay piece and enjoy a cozy brunch.\n\n"
      + "📅 When: Weekdays, 11:00 AM – 1:00 PM\n💙 Perfect for: Mindful creators who enjoy food, art, and calm moments.",
    category: "creative",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2Fcasa%20angelita%2F118713564_632332077418947_8969710903978035450_n.jpg?alt=media&token=00e23243-85ac-494d-a967-ac81478cb055",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2Fcasa%20angelita%2F118692746_353942042309057_4087631286721107144_n.jpg?alt=media&token=71ed70f9-d0f8-439a-a229-64feccbdac6a",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2Fcasa%20angelita%2F376266314_18291123949193997_2521607229150459365_n.jpg?alt=media&token=7f2b31ee-3084-4932-8005-3760dda718a0",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2Fcasa%20angelita%2F363386471_18283588669193997_257275909669153071_n.jpg?alt=media&token=16ce802c-dc73-419b-a507-414912a6ea7d",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2Fcasa%20angelita%2F440353024_945879597317360_2815750907799964978_n.webp?alt=media&token=e6ed145d-f537-447e-b96a-89ec0d008deb",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2Fcasa%20angelita%2F497250740_18371111014193997_899361375228264171_n.webp?alt=media&token=ef7da3ba-89ad-4cdb-ae12-784fe2b26f5b"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2Fcasa%20angelita%2F118713564_632332077418947_8969710903978035450_n.jpg?alt=media&token=00e23243-85ac-494d-a967-ac81478cb055",
    price: 35,
    createdAt: new Date(),
  },
  {
    id: "cre3",
    partnerId: "rwKPyJJTlaSfrZbyb3Hn46gUfDn1",
    title: "Tile Painting Workshop",
    subtitle: "Casa do Azulejo, Lisbon",
    description:
      "Learn to paint traditional Portuguese tiles (“azulejos”) by hand. Transfer designs, mix pigments, and create your own piece of history.\n\n"
      + "🕒 Duration: Up to 2 hours\n🎨 Includes: All materials and kiln firing\n💙 Perfect for: Art lovers and culture enthusiasts.",
    category: "creative",
    imageUrl: [
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2FCasa%20do%20Azulejo%2FA-Casa-Do_Azulejo_19_Edit.jpg?alt=media&token=2190850c-7e14-45b0-be81-ad53a32d002b",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2FCasa%20do%20Azulejo%2FA-Casa-Do_Azulejo_01_Edit.jpg?alt=media&token=2336ca1b-7681-48bd-9ba7-3c55f3d0ff4e",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2FCasa%20do%20Azulejo%2FA-Casa-Do_Azulejo_04_Edit.jpg?alt=media&token=5dd606f5-0930-4c62-85bf-1e53036637d3",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2FCasa%20do%20Azulejo%2FA-Casa-Do_Azulejo_05_Edit.jpg?alt=media&token=bf1ae15c-e858-482a-986d-c5ca9a542187",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2FCasa%20do%20Azulejo%2FA-Casa-Do_Azulejo_10_Edit.jpg?alt=media&token=c947b30e-8c3b-4c8a-ac5a-0c7131a53bf6",
      "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2FCasa%20do%20Azulejo%2FA-Casa-Do_Azulejo_22.jpg?alt=media&token=613fff2b-7f03-4c7c-a71f-7a3dc54c476a"
    ],
    coverImageUrl: "https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/experiences%2Fcreative%2FCasa%20do%20Azulejo%2FA-Casa-Do_Azulejo_19_Edit.jpg?alt=media&token=2190850c-7e14-45b0-be81-ad53a32d002b",
    price: 40,
    createdAt: new Date(),
  },
];

async function seedExperiences() {
  for (const exp of experiences) {
    await db.collection('experiences').doc(exp.id).set(exp);
    console.log(`Added experience: ${exp.title}`);
  }
  console.log('All experiences added successfully!');
}

seedExperiences().catch(console.error);
