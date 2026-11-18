/**
 * Copy of the three public guides (plan: claude/content-pages-plan.md in the
 * Pelotaz project). Mexican Spanish, "tú". No statistics, testimonials or
 * ratings: nothing here may be a claim the page cannot back up. A Pelotaz
 * feature is only named with its real status chip (src/components/marketing/modules.ts).
 * Juan reads this copy before each page ships.
 */

export type GuideSlug = "marketing-para-restaurantes" | "respuestas-a-resenas-de-google" | "que-publicar-en-instagram-restaurante";

export interface GuideSection {
  heading: string;
  body: string[];
  list?: string[];
}

export interface GuideFaq {
  q: string;
  a: string;
}

export interface GuideCopy {
  slug: GuideSlug;
  /** What Google shows. Under 60 characters where possible. */
  metaTitle: string;
  /** Under 160 characters. */
  metaDescription: string;
  title: string;
  titleHighlight: string;
  lead: string;
  /** Short label for links to this guide from other pages. */
  linkLabel: string;
  sections: GuideSection[];
  faq: GuideFaq[];
}

const marketing: GuideCopy = {
  slug: "marketing-para-restaurantes",
  metaTitle: "Marketing para restaurantes: qué hacer cada semana",
  metaDescription:
    "Lo mínimo de marketing que un restaurante necesita cada semana, cuánto tiempo toma y cómo hacer que se haga solo. Guía en español para México.",
  title: "Marketing para restaurantes,",
  titleHighlight: "sin quitarte el tiempo de cocina.",
  lead: "Lo que un restaurante necesita publicar cada semana, cuánto tiempo toma y cómo hacer que se haga casi solo.",
  linkLabel: "Marketing para restaurantes",
  sections: [
    {
      heading: "Lo mínimo que tu restaurante necesita cada semana",
      body: [
        "No hace falta una agencia ni estar todo el día en el celular. Para un restaurante pequeño, lo mínimo que sí se nota es esto:",
      ],
      list: [
        "Tres o cuatro publicaciones en Instagram y Facebook, con fotos reales de tus platillos.",
        "Una razón concreta para venir el día que menos vendes.",
        "Respuesta a las reseñas nuevas, buenas o malas.",
        "Tu horario, tu dirección y tu teléfono al día en Google Maps.",
      ],
    },
    {
      heading: "Empieza por tu día más flojo",
      body: [
        "Mira qué día vendes menos y dale una razón para venir: un platillo, una promoción o un horario. Una publicación con una razón vale más que cinco de «buen provecho».",
        "Si ya llevas tus ventas en un sistema de punto de venta, ahí está el dato. Si no, tu propia memoria del mostrador casi siempre acierta: sabes cuál es tu martes.",
      ],
    },
    {
      heading: "Fotos reales y datos correctos",
      body: [
        "Una foto tuya, hecha con el celular junto a la ventana, convence más que una imagen de banco. Y un precio o una promoción equivocados cuestan más que no publicar: si la publicación dice $89 y en caja cobras $99, el cliente se enoja contigo, no con la publicación.",
        "Antes de aprobar cualquier texto, revisa tres cosas: que el platillo exista en tu menú, que el precio sea el de hoy y que la promoción la puedas cumplir.",
      ],
    },
    {
      heading: "Cuánto tiempo toma",
      body: [
        "Hecho a mano, entre pensar qué publicar, tomar la foto, escribir el texto y subirlo, una publicación se lleva un buen rato. Por eso la mayoría de los restaurantes publica dos semanas con ganas y luego se detiene.",
        "Lo que ayuda es separar el trabajo: alguien o algo propone y escribe, y tú solo apruebas. Eso es lo que hace Pelotaz.",
      ],
    },
    {
      heading: "Cómo lo hace Pelotaz",
      body: [
        "Pelotaz lee el sitio de tu negocio, arma cómo habla y qué ofrece, planea la semana y escribe los borradores. Revisa que no inventen platillos, precios ni promociones, y nada sale sin tu aprobación.",
        "Hoy la beta incluye el perfil de tu marca, el plan semanal y los borradores. El resto de los módulos llega por etapas, y cada uno lleva su estado real.",
      ],
    },
    {
      heading: "Un ejemplo cercano",
      body: [
        "Juanberto's California Burritos, en la colonia Roma Sur de la Ciudad de México, es el restaurante de Juan, el fundador de Pelotaz, y la primera marca que usa Pelotaz.",
      ],
    },
  ],
  faq: [
    {
      q: "¿Cuántas veces a la semana debe publicar un restaurante?",
      a: "No hay un número mágico. Para un restaurante pequeño, tres o cuatro publicaciones a la semana que sí puedas sostener funcionan mejor que diez durante dos semanas y luego nada.",
    },
    {
      q: "¿Qué debo publicar si no tengo tiempo de producir contenido?",
      a: "Tu platillo más pedido, una promoción para tu día más flojo y una foto del equipo o de la cocina. Con eso ya tienes tres publicaciones honestas.",
    },
    {
      q: "¿Pelotaz publica sin que yo lo apruebe?",
      a: "No. Nada sale sin tu aprobación. Durante la beta copias el texto que apruebas y lo publicas tú; la publicación automática llega cuando Meta apruebe la conexión.",
    },
    {
      q: "¿Cuánto cuesta?",
      a: "La beta es gratis y el cupo es limitado. Los planes de pago todavía no están abiertos; los precios de lanzamiento están en la página principal.",
    },
  ],
};

const resenas: GuideCopy = {
  slug: "respuestas-a-resenas-de-google",
  metaTitle: "Cómo responder reseñas de Google en tu restaurante",
  metaDescription:
    "Respuestas para copiar y adaptar a reseñas de Google de tu restaurante: buenas, malas e injustas. En español de México, con lo que no debes decir.",
  title: "Cómo responder reseñas de Google",
  titleHighlight: "en tu restaurante.",
  lead: "Respuestas listas para copiar y adaptar, en español de México, para reseñas buenas, malas e injustas.",
  linkLabel: "Respuestas a reseñas de Google",
  sections: [
    {
      heading: "Reglas antes de responder",
      body: ["Cuatro reglas que valen para cualquier reseña:"],
      list: [
        "Responde con tus palabras y menciona algo concreto de la reseña. Una respuesta igual para todos se nota.",
        "Nunca discutas en público. Contesta una vez, con calma, y ofrece seguir la conversación por privado.",
        "No prometas lo que no puedes cumplir: ni reembolsos ni regalos que no vayas a dar.",
        "No cuentes datos del cliente ni de su pedido. Tu respuesta la lee todo el mundo.",
      ],
    },
    {
      heading: "Qué no decir",
      body: [
        "Evita «lamentamos que se haya sentido así» sin decir qué vas a hacer, evita echarle la culpa al cliente y evita escribir en mayúsculas. Tampoco copies una respuesta tal cual: cambia al menos el nombre y un detalle.",
      ],
    },
  ],
  faq: [
    {
      q: "¿Tengo que responder todas las reseñas?",
      a: "No es obligatorio, pero responder muestra que alguien atiende el negocio. Si no te da tiempo de todas, empieza por las que dicen algo concreto, buenas o malas.",
    },
    {
      q: "¿Responder reseñas me hace salir más arriba en Google?",
      a: "Las fuentes no se ponen de acuerdo. Algunas dicen que ayuda al posicionamiento local y otras que responder más no garantiza por sí solo una mejor posición. Lo seguro es que los clientes sí leen las respuestas.",
    },
    {
      q: "¿Qué hago con una reseña falsa o injusta?",
      a: "Responde con calma y con hechos, sin acusar. Si la reseña rompe las reglas de Google (por ejemplo, no es de un cliente real), puedes reportarla desde tu Perfil de Negocio.",
    },
  ],
};

const instagram: GuideCopy = {
  slug: "que-publicar-en-instagram-restaurante",
  metaTitle: "Qué publicar en Instagram para tu restaurante: plan",
  metaDescription:
    "Un plan de cuatro semanas con qué publicar en Instagram y Facebook en tu restaurante, y por qué cada publicación. Fácil de copiar y adaptar.",
  title: "Qué publicar en Instagram",
  titleHighlight: "en tu restaurante.",
  lead: "Un plan de cuatro semanas con qué publicar y por qué, para que no te quedes en blanco.",
  linkLabel: "Qué publicar en Instagram",
  sections: [
    {
      heading: "Cómo usar este plan",
      body: [
        "Son cuatro publicaciones por semana durante cuatro semanas. Cada una lleva su razón, porque una publicación sin razón es relleno. Cambia lo que está entre corchetes por lo tuyo y usa fotos reales.",
        "Si cuatro a la semana son muchas, quédate con las dos primeras de cada semana y sube el ritmo cuando lo puedas sostener.",
      ],
    },
  ],
  faq: [
    {
      q: "¿Instagram o Facebook?",
      a: "Las dos, con la misma foto y el mismo texto adaptados. Publicar en ambas no te cuesta el doble de trabajo.",
    },
    {
      q: "¿Necesito hacer videos?",
      a: "No para empezar. Una buena foto con un texto claro es suficiente. Cuando tengas el ritmo, puedes sumar videos cortos.",
    },
  ],
};

export const guias: Record<GuideSlug, GuideCopy> = {
  "marketing-para-restaurantes": marketing,
  "respuestas-a-resenas-de-google": resenas,
  "que-publicar-en-instagram-restaurante": instagram,
};

export const GUIDE_SLUGS = Object.keys(guias) as GuideSlug[];

/** Replies for the reviews guide: what happened, and a reply to adapt. [Brackets] are for the owner to fill in. */
export const reviewReplies: { situation: string; reply: string }[] = [
  {
    situation: "Reseña buena, sin detalle",
    reply:
      "¡Gracias, [nombre], por tomarte el tiempo de escribirnos! Nos da mucho gusto que la hayas pasado bien. Aquí te esperamos para la próxima.",
  },
  {
    situation: "Reseña buena que menciona un platillo",
    reply:
      "¡Qué bueno que te gustó el [platillo], [nombre]! Es de los que más pedimos. Le pasamos tu comentario al equipo de cocina. ¡Gracias por venir!",
  },
  {
    situation: "Tres estrellas: «estuvo bien, pero…»",
    reply:
      "Gracias por tu opinión, [nombre]. Nos alegra que [lo que sí le gustó], y tomamos nota de lo que no estuvo a la altura: [lo que mencionó]. Si quieres, escríbenos a [tu correo o WhatsApp] y lo platicamos.",
  },
  {
    situation: "Reseña mala por tardanza",
    reply:
      "[Nombre], tienes razón en que esperar tanto no está bien, y te ofrecemos una disculpa. Estamos revisando cómo atendemos las horas de más gente. Escríbenos a [tu correo o WhatsApp] para saber más de tu visita.",
  },
  {
    situation: "Reseña mala por el platillo",
    reply:
      "Lamentamos que tu [platillo] no llegara como debe, [nombre]. Así no queremos que lo pruebes. Cuéntanos qué pasó a [tu correo o WhatsApp] para revisarlo con la cocina y que la próxima vez salga bien.",
  },
  {
    situation: "Reseña de pedido a domicilio (llegó frío o tarde)",
    reply:
      "Gracias por avisarnos, [nombre]. Sabemos que un pedido que llega frío no es la experiencia que queremos darte. Escríbenos a [tu correo o WhatsApp] con tu número de pedido para revisar qué pasó.",
  },
  {
    situation: "Reseña que parece falsa o injusta",
    reply:
      "Hola, [nombre]. No encontramos registro de la visita que describes y queremos entender qué pasó. Escríbenos a [tu correo o WhatsApp] con los datos de tu visita para poder revisarlo.",
  },
];

/** Four weeks, four posts each: what to post and why. [Brackets] are for the owner to fill in. */
export const instagramPlan: { week: string; theme: string; posts: { day: string; post: string; reason: string }[] }[] = [
  {
    week: "Semana 1",
    theme: "Lo que ya vendes",
    posts: [
      { day: "Lunes", post: "Foto de tu platillo más pedido, con el precio de hoy.", reason: "Es lo que más gente ya sabe que quiere; cualquier visitante nuevo empieza por ahí." },
      { day: "Miércoles", post: "Foto de tu local por dentro, con horario y dirección en el texto.", reason: "Quien te encuentra por primera vez necesita saber dónde y cuándo." },
      { day: "Viernes", post: "Una foto del equipo preparando algo.", reason: "Pone cara al negocio y da confianza." },
      { day: "Sábado", post: "Tu combo o promoción del fin de semana.", reason: "Una razón concreta para decidir dónde comer." },
    ],
  },
  {
    week: "Semana 2",
    theme: "Tu día más flojo",
    posts: [
      { day: "Lunes", post: "Promoción para [tu día más flojo], con hora y condiciones claras.", reason: "Ataca el día que más lo necesita en vez de repartir el esfuerzo parejo." },
      { day: "Miércoles", post: "Un platillo que no suelas anunciar.", reason: "Le da salida a lo que casi nadie conoce." },
      { day: "Viernes", post: "Foto de un cliente feliz, con su permiso.", reason: "Una persona real convence más que un anuncio." },
      { day: "Domingo", post: "Qué incluye la promoción de [tu día más flojo] esta semana.", reason: "Recuerda la oferta antes de que empiece." },
    ],
  },
  {
    week: "Semana 3",
    theme: "Cómo se hace",
    posts: [
      { day: "Lunes", post: "Un paso de la preparación de tu platillo estrella.", reason: "Se ve cómo se hace y por qué vale lo que cuesta." },
      { day: "Miércoles", post: "De dónde sale un ingrediente que uses.", reason: "Da una razón más para elegirte." },
      { day: "Viernes", post: "Una pregunta simple: «¿cuál es tu favorito, [A] o [B]?».", reason: "Invita a responder y te dice qué se vende." },
      { day: "Sábado", post: "El platillo más pedido de la semana.", reason: "Prueba social: lo que otros ya piden." },
    ],
  },
  {
    week: "Semana 4",
    theme: "Que vuelvan",
    posts: [
      { day: "Lunes", post: "Agradece las reseñas de la semana y comparte una.", reason: "Muestra que escuchas y refuerza las buenas opiniones." },
      { day: "Miércoles", post: "Un platillo o promoción nuevos, con una foto clara.", reason: "Una razón para volver a quien ya te conoce." },
      { day: "Viernes", post: "El horario del fin de semana, y si hay algún cambio.", reason: "Evita que alguien llegue y encuentre cerrado." },
      { day: "Domingo", post: "Un adelanto de lo que viene la próxima semana.", reason: "Mantiene el hábito de seguirte." },
    ],
  },
];
