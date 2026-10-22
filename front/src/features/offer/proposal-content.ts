import type { BusinessUnit, Quote, QuoteItem } from '@ggis/domain';

export type ProposalComponent = {
  title: string;
  text: string;
  patterns: string[];
};

export type ProposalStat = {
  label: string;
  patterns: string[];
};

export type UnitProposalContent = {
  tagline: string;
  needTitle: string;
  needIntro: string;
  opportunity: string;
  needCaption: string;
  needSubcaption: string;
  architectureTitle: string;
  architectureIntro: string;
  architectureCaption: string;
  flow: [string, string, string];
  integration: string[];
  components: ProposalComponent[];
  stats: ProposalStat[];
  implementationTitle: string;
  implementationIntro: string;
  stages: Array<{ label: string; title: string; text: string }>;
  delivery: string;
  checklist: string[];
  visit: Array<{ title: string; text: string }>;
  commitment: string;
  includes: string[];
  excludes: string[];
  closingTitle: string;
  closingIntro: string;
};

const FIRE: UnitProposalContent = {
  tagline: 'Detectar\na tiempo.\nProteger\nsiempre.',
  needTitle: 'Un sistema de detección\nlisto para responder',
  needIntro:
    'Un sistema de detección de incendios solo protege si está disponible. Esta propuesta mantiene, prueba y ajusta la instalación para que detecte a tiempo, notifique con claridad y deje evidencia de su estado.',
  opportunity:
    'Realizar el mantenimiento preventivo del sistema, verificar cada dispositivo y entregar un informe con hallazgos y recomendaciones para mantener la operación protegida.',
  needCaption: 'Un sistema probado y listo para responder.',
  needSubcaption: 'Mantenimiento preventivo con trazabilidad, no una visita de emergencia.',
  architectureTitle: 'Una detección confiable,\nde la central al último detector',
  architectureIntro:
    'El sistema combina una central de control, dispositivos de detección, señalización y la infraestructura de canalización y cableado que los conecta. El mantenimiento cubre cada eslabón de esa cadena.',
  architectureCaption: 'Cobertura en la operación',
  flow: ['Detección', 'Notificación', 'Respuesta'],
  integration: [
    'Diagnóstico y revisión del sistema.',
    'Mantenimiento de central y dispositivos.',
    'Pruebas de detección y notificación.',
    'Ajustes y reposición de consumibles.',
    'Informe técnico y recomendaciones.',
    'Acompañamiento y garantía.',
  ],
  components: [
    {
      title: 'Panel de detección (FACP)',
      text: 'Central de control y supervisión del sistema.',
      patterns: ['panel', 'facp', 'central'],
    },
    {
      title: 'Detector de humo',
      text: 'Detección temprana en las áreas protegidas.',
      patterns: ['detector', 'humo'],
    },
    {
      title: 'Estación manual y sirena',
      text: 'Activación y notificación audible y visual.',
      patterns: ['estaci', 'manual', 'sirena', 'estrobo', 'pulsador'],
    },
    {
      title: 'Tubería EMT y cable FPLR',
      text: 'Canalización y cableado resistente al fuego.',
      patterns: ['tuber', 'emt', 'cable', 'fplr'],
    },
  ],
  stats: [
    { label: 'Central de detección', patterns: ['panel', 'facp', 'central'] },
    { label: 'Detectores de humo', patterns: ['detector', 'humo'] },
    { label: 'Estaciones manuales', patterns: ['estaci', 'manual', 'pulsador'] },
    { label: 'Sirenas y estrobos', patterns: ['sirena', 'estrobo', 'avisador'] },
  ],
  implementationTitle: 'De la visita\na la confianza',
  implementationIntro:
    'El valor del mantenimiento no termina cuando se revisa el último dispositivo. Incluye pruebas, registro y una entrega que permita operar con claridad.',
  stages: [
    {
      label: 'Etapa 01',
      title: 'Programación',
      text: 'Coordinación de acceso, alcance y fecha. Equipos nacionales: {national}. Importación: {import}.',
    },
    {
      label: 'Etapa 02',
      title: 'Mantenimiento',
      text: 'Revisión de central, detectores, estaciones, sirenas y baterías; ajustes y pruebas funcionales.',
    },
    {
      label: 'Etapa 03',
      title: 'Entrega',
      text: 'Informe técnico, resultados de pruebas, recomendaciones y capacitación básica al equipo.',
    },
  ],
  delivery:
    'Acta de entrega, inventario, registro de pruebas, informe de hallazgos y recomendaciones, y capacitación básica para la operación.',
  checklist: [
    'Confirmar alcance y cantidad de dispositivos.',
    'Coordinar acceso, horarios y permisos del sitio.',
    'Verificar energía, baterías y respaldo.',
    'Definir repuestos y consumibles incluidos.',
    'Confirmar la fecha de inicio del mantenimiento.',
    'Precisar el alcance de la capacitación.',
  ],
  visit: [
    { title: 'Central de control', text: 'Panel, fuentes y baterías de respaldo.' },
    { title: 'Detección', text: 'Detectores de humo y módulos de control.' },
    { title: 'Notificación', text: 'Estaciones manuales, sirenas y estrobos.' },
    { title: 'Infraestructura', text: 'Tubería EMT, cableado FPLR y soportes.' },
    { title: 'Pruebas', text: 'Detección, notificación y registro de resultados.' },
    { title: 'Entrega', text: 'Informe, recomendaciones y capacitación.' },
  ],
  commitment:
    'Ejecutar el mantenimiento con el sistema en operación, documentar cada prueba y dejar la instalación lista para responder.',
  includes: [
    'Mantenimiento preventivo del sistema.',
    'Pruebas de detección y notificación.',
    'Informe técnico y recomendaciones.',
    'Repuestos y consumibles cotizados.',
  ],
  excludes: [
    'Obras civiles, cárcamos o diques.',
    'SISO, andamios o trabajos especiales.',
    'Repuestos no discriminados en la oferta.',
    'Certificación del cuerpo de bomberos.',
  ],
  closingTitle: 'Una propuesta para\navanzar con claridad',
  closingIntro:
    'Cada proyecto empieza con una conversación clara sobre alcance, tiempos, inversión y responsabilidades.',
};

const CCTV: UnitProposalContent = {
  tagline: 'Ver\npara\nproteger.',
  needTitle: 'Más que cámaras:\ncontrol sobre la operación',
  needIntro:
    'Una operación necesita visibilidad en los puntos donde se mueven personas, mercancías y decisiones. Esta propuesta integra captura, grabación, red e instalación para convertir esos puntos en información útil.',
  opportunity:
    'Supervisar la operación, revisar eventos y conservar evidencia con una solución instalada y configurada para el espacio.',
  needCaption: 'Una operación más visible y controlada.',
  needSubcaption: 'Diseñamos la solución alrededor de la operación real, no de un catálogo.',
  architectureTitle: 'Una arquitectura\nlista para crecer',
  architectureIntro:
    'El sistema combina captura, transmisión, almacenamiento y organización física. La capacidad se define según los puntos de cámara, la red y el tiempo de retención requerido.',
  architectureCaption: 'Cobertura en la operación',
  flow: ['Captura', 'Transmisión', 'Gestión'],
  integration: [
    'Diagnóstico y definición de puntos de cámara.',
    'Suministro de equipos e infraestructura.',
    'Instalación, configuración y puesta en marcha.',
    'Prueba de imagen y grabación.',
    'Configuración de acceso remoto.',
    'Acompañamiento técnico y garantía.',
  ],
  components: [
    {
      title: 'Cámaras bala y domo IP',
      text: '2 MP · lente 2,8 mm · Smart Dual Light · IP67.',
      patterns: ['cámara', 'camara', 'domo', 'bala'],
    },
    {
      title: 'NVR de 16 canales',
      text: 'H.265+ · HDMI 4K · VGA · almacenamiento SATA.',
      patterns: ['nvr', 'dvr', 'grabador'],
    },
    {
      title: 'Red y protección física',
      text: 'Switch PoE, cable Cat 6, rack, tubería y soportes.',
      patterns: ['switch', 'poe', 'cable', 'rack', 'tuber'],
    },
    {
      title: 'Instalación y configuración',
      text: 'Montaje, configuración y puesta en marcha.',
      patterns: ['mano de obra', 'instalaci', 'configuraci'],
    },
  ],
  stats: [
    { label: 'Cámaras', patterns: ['cámara', 'camara', 'domo', 'bala'] },
    { label: 'Grabadores', patterns: ['nvr', 'dvr', 'grabador'] },
    { label: 'Switches / red', patterns: ['switch', 'poe', 'router'] },
    { label: 'Discos / almacenamiento', patterns: ['disco', 'almacenamiento', 'hdd'] },
  ],
  implementationTitle: 'De la instalación\na la confianza',
  implementationIntro:
    'El valor de la solución no termina cuando se fija la última cámara. Incluye configuración, pruebas y una entrega que permita operar con claridad.',
  stages: [
    {
      label: 'Etapa 01',
      title: 'Disponibilidad',
      text: 'Equipos nacionales: {national}. Importación: {import}. Instalación: {install}.',
    },
    {
      label: 'Etapa 02',
      title: 'Instalación',
      text: 'Montaje físico, canalización, conexión PoE y organización del rack.',
    },
    {
      label: 'Etapa 03',
      title: 'Configuración',
      text: 'Ajuste de cámaras, grabación, acceso remoto y puesta en operación.',
    },
  ],
  delivery:
    'Acta de entrega, inventario, números de serie, usuarios, contraseñas, prueba de grabación, cobertura definida y capacitación básica.',
  checklist: [
    'Confirmar marca y referencia de cada equipo.',
    'Adjuntar plano de ubicación de las cámaras.',
    'Definir días de retención y capacidad de disco.',
    'Confirmar si el audio quedará habilitado.',
    'Verificar energía, UPS y protección eléctrica.',
    'Definir acceso remoto y responsables.',
  ],
  visit: [
    { title: 'Puntos de cámara', text: 'Cobertura y altura de montaje.' },
    { title: 'Grabación', text: 'NVR, disco y retención.' },
    { title: 'Red', text: 'Switch PoE, cableado y rack.' },
    { title: 'Energía', text: 'UPS y protecciones eléctricas.' },
    { title: 'Pruebas', text: 'Imagen, grabación y acceso remoto.' },
    { title: 'Entrega', text: 'Inventario, usuarios y capacitación.' },
  ],
  commitment:
    'Instalar y configurar la solución para que la operación tenga visibilidad real, evidencia disponible y soporte después de la entrega.',
  includes: [
    'Suministro de equipos cotizados.',
    'Instalación y configuración.',
    'Puesta en marcha y pruebas.',
    'Capacitación básica.',
  ],
  excludes: [
    'Obras civiles, cárcamos o diques.',
    'SISO, andamios o trabajos especiales.',
    'Equipos no discriminados en la oferta.',
    'Certificación del cuerpo de bomberos.',
  ],
  closingTitle: 'Una propuesta para\navanzar con claridad',
  closingIntro:
    'Cada proyecto empieza con una conversación clara sobre alcance, tiempos, inversión y responsabilidades.',
};

const ACCESS: UnitProposalContent = {
  ...CCTV,
  tagline: 'Controlar\npara\nproteger.',
  needTitle: 'Cada acceso,\nuna decisión controlada',
  needIntro:
    'El control de acceso ordena quién entra, cuándo y por dónde. Esta propuesta integra lectores, controladoras, cerraduras y registros para que la operación tenga trazabilidad sin frenar el flujo de personas.',
  opportunity:
    'Controlar los accesos, registrar eventos y mantener la operación fluida con una solución instalada y configurada para el sitio.',
  needCaption: 'Accesos ordenados, operación tranquila.',
  needSubcaption: 'Control y trazabilidad sin frenar la operación.',
  architectureTitle: 'Una arquitectura\nde acceso confiable',
  architectureIntro:
    'El sistema combina credenciales, lectores, controladoras, cerraduras y registro de eventos. La configuración se define según los flujos y los niveles de acceso del sitio.',
  architectureCaption: 'Control en los puntos de acceso',
  flow: ['Credencial', 'Validación', 'Apertura'],
  integration: [
    'Diagnóstico de flujos y puntos de acceso.',
    'Suministro de lectores y controladoras.',
    'Instalación de cerraduras y botones.',
    'Configuración de permisos y horarios.',
    'Pruebas de apertura y registro.',
    'Capacitación y garantía.',
  ],
  components: [
    {
      title: 'Lectores y credenciales',
      text: 'Identificación en cada punto de acceso.',
      patterns: ['lector', 'credencial', 'tarjeta', 'huella'],
    },
    {
      title: 'Controladoras',
      text: 'Validación y administración de permisos.',
      patterns: ['controladora', 'controlador'],
    },
    {
      title: 'Cerraduras y botones',
      text: 'Apertura controlada y salida segura.',
      patterns: ['cerradura', 'botón', 'boton', 'electroimán'],
    },
    {
      title: 'Registro y monitoreo',
      text: 'Trazabilidad de eventos y accesos.',
      patterns: ['software', 'registro', 'monitoreo'],
    },
  ],
  stats: [
    { label: 'Lectores', patterns: ['lector'] },
    { label: 'Controladoras', patterns: ['controladora', 'controlador'] },
    { label: 'Cerraduras', patterns: ['cerradura', 'electroimán'] },
    { label: 'Botones de salida', patterns: ['botón', 'boton'] },
  ],
  implementationTitle: 'Del acceso\na la tranquilidad',
  implementationIntro:
    'El control no termina con la instalación: incluye configuración de permisos, pruebas y una entrega clara para administrar el sistema.',
  stages: [
    {
      label: 'Etapa 01',
      title: 'Disponibilidad',
      text: 'Equipos nacionales: {national}. Importación: {import}. Instalación: {install}.',
    },
    {
      label: 'Etapa 02',
      title: 'Instalación',
      text: 'Montaje de lectores, controladoras, cerraduras y botones de salida.',
    },
    {
      label: 'Etapa 03',
      title: 'Configuración',
      text: 'Permisos, horarios, pruebas y capacitación del equipo administrador.',
    },
  ],
  delivery:
    'Acta de entrega, inventario, usuarios administradores, permisos configurados, prueba de apertura y capacitación básica.',
  checklist: [
    'Confirmar puntos de acceso y tipos de credencial.',
    'Definir niveles, horarios y responsables.',
    'Verificar cerraduras, botones y energía.',
    'Confirmar integración con otros sistemas.',
    'Definir quién administrará los permisos.',
    'Precisar el alcance de la capacitación.',
  ],
  visit: [
    { title: 'Accesos', text: 'Puertas y flujos a controlar.' },
    { title: 'Lectores', text: 'Credenciales y validación.' },
    { title: 'Cerraduras', text: 'Apertura, salida y energía.' },
    { title: 'Controladoras', text: 'Configuración y comunicación.' },
    { title: 'Pruebas', text: 'Permisos, horarios y registro.' },
    { title: 'Entrega', text: 'Usuarios, documentación y capacitación.' },
  ],
  commitment:
    'Dejar cada acceso controlado, documentado y administrable, con permisos claros y trazabilidad de eventos.',
  includes: [
    'Suministro de equipos cotizados.',
    'Instalación y configuración.',
    'Permisos y horarios.',
    'Pruebas y capacitación básica.',
  ],
  excludes: [
    'Obras civiles o modificaciones de puertas.',
    'SISO, andamios o trabajos especiales.',
    'Equipos no discriminados en la oferta.',
    'Integraciones no cotizadas.',
  ],
  closingTitle: 'Una propuesta para\navanzar con claridad',
  closingIntro:
    'Cada proyecto empieza con una conversación clara sobre alcance, tiempos, inversión y responsabilidades.',
};

const ANTI_THEFT: UnitProposalContent = {
  ...CCTV,
  tagline: 'Proteger\nla mercancía.\nPreservar\nel margen.',
  needTitle: 'Menos pérdidas,\nmás control sobre la mercancía',
  needIntro:
    'La merma silenciosa se combate con visibilidad y disuasión en los puntos correctos. Esta propuesta integra antenas, etiquetas y desactivación para proteger la mercancía sin afectar la experiencia de compra.',
  opportunity:
    'Reducir pérdidas, disuadir el hurto y conservar evidencia con una solución instalada y configurada para la operación.',
  needCaption: 'Mercancía protegida, operación tranquila.',
  needSubcaption: 'Disuasión y control sin frenar la experiencia del cliente.',
  architectureTitle: 'Una barrera\npara la mercancía',
  architectureIntro:
    'El sistema combina antenas de detección, etiquetas, desactivadores y monitoreo para proteger los puntos de salida y la mercancía de alto valor.',
  architectureCaption: 'Protección en los puntos de salida',
  flow: ['Etiqueta', 'Detección', 'Respuesta'],
  integration: [
    'Diagnóstico de puntos de salida y mercancía.',
    'Suministro de antenas y etiquetas.',
    'Instalación y calibración.',
    'Configuración de desactivación.',
    'Pruebas y capacitación.',
    'Acompañamiento y garantía.',
  ],
  components: [
    {
      title: 'Antenas EAS',
      text: 'Detección en los puntos de salida.',
      patterns: ['antena', 'eas', 'pedestal'],
    },
    {
      title: 'Etiquetas y adhesivos',
      text: 'Protección de la mercancía.',
      patterns: ['etiqueta', 'tag', 'adhesivo'],
    },
    {
      title: 'Desactivadores',
      text: 'Desactivación en caja y operación.',
      patterns: ['desactivador', 'desactivaci'],
    },
    {
      title: 'Monitoreo y pruebas',
      text: 'Verificación y control del sistema.',
      patterns: ['monitoreo', 'software', 'prueba'],
    },
  ],
  stats: [
    { label: 'Antenas', patterns: ['antena', 'eas', 'pedestal'] },
    { label: 'Etiquetas', patterns: ['etiqueta', 'tag', 'adhesivo'] },
    { label: 'Desactivadores', patterns: ['desactivador', 'desactivaci'] },
    { label: 'Puntos de salida', patterns: ['salida', 'puerta'] },
  ],
  implementationTitle: 'De la protección\na la tranquilidad',
  implementationIntro:
    'La solución no termina con la instalación: incluye calibración, pruebas y una entrega que permita operar el sistema con confianza.',
  stages: [
    {
      label: 'Etapa 01',
      title: 'Disponibilidad',
      text: 'Equipos nacionales: {national}. Importación: {import}. Instalación: {install}.',
    },
    {
      label: 'Etapa 02',
      title: 'Instalación',
      text: 'Montaje de antenas, cableado, calibración y desactivadores.',
    },
    {
      label: 'Etapa 03',
      title: 'Configuración',
      text: 'Pruebas, ajustes, capacitación y entrega de la operación.',
    },
  ],
  delivery:
    'Acta de entrega, inventario, pruebas de detección, calibración, capacitación y recomendaciones de operación.',
  checklist: [
    'Confirmar puntos de salida y tipo de mercancía.',
    'Definir etiquetas y consumibles.',
    'Verificar energía y cableado.',
    'Coordinar pruebas con la operación.',
    'Definir responsables de desactivación.',
    'Precisar el alcance de la capacitación.',
  ],
  visit: [
    { title: 'Salidas', text: 'Puntos de detección y flujo.' },
    { title: 'Antenas', text: 'Montaje y calibración.' },
    { title: 'Etiquetas', text: 'Mercancía y consumibles.' },
    { title: 'Desactivación', text: 'Caja y operación.' },
    { title: 'Pruebas', text: 'Detección y falsas alarmas.' },
    { title: 'Entrega', text: 'Capacitación y documentación.' },
  ],
  commitment:
    'Proteger la mercancía con una solución calibrada, discreta y documentada, sin afectar la experiencia de compra.',
  includes: [
    'Suministro de equipos cotizados.',
    'Instalación y calibración.',
    'Pruebas y ajustes.',
    'Capacitación básica.',
  ],
  excludes: [
    'Obras civiles o modificaciones locativas.',
    'SISO, andamios o trabajos especiales.',
    'Consumibles no cotizados.',
    'Integraciones no cotizadas.',
  ],
  closingTitle: 'Una propuesta para\navanzar con claridad',
  closingIntro:
    'Cada proyecto empieza con una conversación clara sobre alcance, tiempos, inversión y responsabilidades.',
};

const SOLT: UnitProposalContent = {
  ...CCTV,
  tagline: 'Saber dónde está.\nActuar a tiempo.',
  needTitle: 'Visibilidad sobre\nla operación en movimiento',
  needIntro:
    'Saber dónde está un vehículo o un activo cambia la capacidad de respuesta. Esta propuesta integra localización, conectividad y plataforma para convertir la posición en información útil.',
  opportunity:
    'Supervisar la operación, revisar recorridos y conservar historial con una solución instalada y configurada para la flota o los activos.',
  needCaption: 'La operación, visible donde está.',
  needSubcaption: 'Localización y historial para decidir a tiempo.',
  architectureTitle: 'Una arquitectura\nde localización confiable',
  architectureIntro:
    'El sistema combina dispositivos de localización, conectividad y una plataforma de monitoreo para consultar posición, recorridos y eventos.',
  architectureCaption: 'Visibilidad de la operación',
  flow: ['Localización', 'Conectividad', 'Monitoreo'],
  integration: [
    'Diagnóstico de flota o activos.',
    'Suministro e instalación de dispositivos.',
    'Configuración de conectividad.',
    'Alta en la plataforma de monitoreo.',
    'Pruebas y capacitación.',
    'Acompañamiento y garantía.',
  ],
  components: [
    {
      title: 'Dispositivos GPS',
      text: 'Localización de vehículos o activos.',
      patterns: ['gps', 'localizador', 'rastreador'],
    },
    {
      title: 'Conectividad',
      text: 'Transmisión de posición y eventos.',
      patterns: ['sim', 'conectividad', 'datos'],
    },
    {
      title: 'Plataforma',
      text: 'Consulta de recorridos, eventos y reportes.',
      patterns: ['plataforma', 'software', 'monitoreo'],
    },
    {
      title: 'Instalación',
      text: 'Montaje y puesta en marcha.',
      patterns: ['instalaci', 'configuraci'],
    },
  ],
  stats: [
    { label: 'Dispositivos GPS', patterns: ['gps', 'localizador', 'rastreador'] },
    { label: 'Equipos instalados', patterns: ['instalaci', 'equipo'] },
    { label: 'Plataformas', patterns: ['plataforma', 'software'] },
    { label: 'Puntos de control', patterns: ['control', 'monitoreo'] },
  ],
  implementationTitle: 'De la instalación\nal control',
  implementationIntro:
    'La solución no termina con el montaje: incluye configuración, pruebas y una entrega que permita operar la plataforma con claridad.',
  stages: [
    {
      label: 'Etapa 01',
      title: 'Disponibilidad',
      text: 'Equipos nacionales: {national}. Importación: {import}. Instalación: {install}.',
    },
    {
      label: 'Etapa 02',
      title: 'Instalación',
      text: 'Montaje de dispositivos, conexión y verificación de señal.',
    },
    {
      label: 'Etapa 03',
      title: 'Configuración',
      text: 'Alta en plataforma, pruebas, usuarios y capacitación.',
    },
  ],
  delivery:
    'Acta de entrega, inventario, dispositivos configurados, usuarios de plataforma, pruebas y capacitación básica.',
  checklist: [
    'Confirmar vehículos o activos a monitorear.',
    'Definir reportes y alertas requeridas.',
    'Verificar cobertura y energía.',
    'Confirmar usuarios de la plataforma.',
    'Definir responsables de monitoreo.',
    'Precisar el alcance de la capacitación.',
  ],
  visit: [
    { title: 'Activos', text: 'Vehículos o equipos a monitorear.' },
    { title: 'Dispositivos', text: 'GPS, sensores y montaje.' },
    { title: 'Conectividad', text: 'Cobertura y transmisión.' },
    { title: 'Plataforma', text: 'Usuarios, recorridos y alertas.' },
    { title: 'Pruebas', text: 'Posición, historial y eventos.' },
    { title: 'Entrega', text: 'Documentación y capacitación.' },
  ],
  commitment:
    'Dejar la operación visible y documentada, con dispositivos configurados y una plataforma lista para consultar.',
  includes: [
    'Suministro de equipos cotizados.',
    'Instalación y configuración.',
    'Alta en plataforma.',
    'Capacitación básica.',
  ],
  excludes: [
    'Obras civiles o modificaciones locativas.',
    'SISO, andamios o trabajos especiales.',
    'Equipos no discriminados en la oferta.',
    'Suscripciones o servicios no cotizados.',
  ],
  closingTitle: 'Una propuesta para\navanzar con claridad',
  closingIntro:
    'Cada proyecto empieza con una conversación clara sobre alcance, tiempos, inversión y responsabilidades.',
};

const GENERIC: UnitProposalContent = {
  ...CCTV,
  tagline: 'Proteger\nla operación.',
  needTitle: 'Una solución\npara la operación',
  needIntro:
    'Esta propuesta integra los equipos, la infraestructura y el acompañamiento necesarios para que la solución funcione desde el primer día y se mantenga en el tiempo.',
  opportunity:
    'Implementar la solución con un alcance claro, pruebas de funcionamiento y una entrega documentada para la operación.',
  needCaption: 'Una solución instalada y lista para operar.',
  needSubcaption: 'Diseñada alrededor de la operación, no de un catálogo.',
  architectureTitle: 'Una arquitectura\nlista para operar',
  architectureIntro:
    'El sistema combina equipos, conectividad y configuración para cubrir la necesidad planteada con una operación clara y soporte posterior.',
  architectureCaption: 'Cobertura de la operación',
  flow: ['Suministro', 'Instalación', 'Operación'],
  integration: [
    'Diagnóstico de la necesidad.',
    'Suministro de equipos e infraestructura.',
    'Instalación y configuración.',
    'Pruebas de funcionamiento.',
    'Capacitación básica.',
    'Acompañamiento y garantía.',
  ],
  components: [],
  stats: [],
  implementationTitle: 'De la instalación\na la confianza',
  implementationIntro:
    'El valor de la solución no termina con la instalación. Incluye configuración, pruebas y una entrega que permita operar con claridad.',
  stages: [
    {
      label: 'Etapa 01',
      title: 'Disponibilidad',
      text: 'Equipos nacionales: {national}. Importación: {import}. Instalación: {install}.',
    },
    {
      label: 'Etapa 02',
      title: 'Instalación',
      text: 'Montaje, conexión y organización de la infraestructura.',
    },
    {
      label: 'Etapa 03',
      title: 'Entrega',
      text: 'Configuración, pruebas, documentación y capacitación.',
    },
  ],
  delivery:
    'Acta de entrega, inventario, pruebas de funcionamiento, documentación y capacitación básica.',
  checklist: [
    'Confirmar el alcance y las cantidades.',
    'Coordinar acceso y permisos del sitio.',
    'Verificar energía y conectividad.',
    'Definir responsables de la operación.',
    'Confirmar la fecha de inicio.',
    'Precisar el alcance de la capacitación.',
  ],
  visit: [
    { title: 'Alcance', text: 'Necesidad y puntos críticos.' },
    { title: 'Equipos', text: 'Suministro y verificación.' },
    { title: 'Instalación', text: 'Montaje y conexión.' },
    { title: 'Configuración', text: 'Ajustes y puesta en marcha.' },
    { title: 'Pruebas', text: 'Funcionamiento y registro.' },
    { title: 'Entrega', text: 'Documentación y capacitación.' },
  ],
  commitment:
    'Entregar una solución instalada, probada y documentada, con acompañamiento para que la operación pueda usarla desde el primer día.',
  includes: [
    'Suministro de equipos cotizados.',
    'Instalación y configuración.',
    'Pruebas de funcionamiento.',
    'Capacitación básica.',
  ],
  excludes: [
    'Obras civiles o modificaciones locativas.',
    'SISO, andamios o trabajos especiales.',
    'Equipos no discriminados en la oferta.',
    'Servicios no cotizados.',
  ],
  closingTitle: 'Una propuesta para\navanzar con claridad',
  closingIntro:
    'Cada proyecto empieza con una conversación clara sobre alcance, tiempos, inversión y responsabilidades.',
};

const CONTENT: Record<BusinessUnit, UnitProposalContent> = {
  cctv: CCTV,
  fire: FIRE,
  access_control: ACCESS,
  anti_theft: ANTI_THEFT,
  solt: SOLT,
};

/**
 * Algunas cotizaciones viejas tienen la unidad de negocio mal marcada. Si los ítems
 * hablan claramente de incendios o CCTV, esa evidencia manda sobre la etiqueta.
 */
export function effectiveBusinessUnit(q: Quote): BusinessUnit | null {
  const text = [q.client.project, ...q.items.map((i) => i.description)].join(' ').toLowerCase();
  const fire = (text.match(/incend|fuego|humo|detector|extinci|sirena|estaci[oó]n manual|facp|rociador/g) ?? [])
    .length;
  const cctv = (text.match(/c[aá]mara|cctv|nvr|dvr|videovigil|domo|bala/g) ?? []).length;
  if (fire >= 2 && fire > cctv) return 'fire';
  if (cctv >= 2 && cctv > fire) return 'cctv';
  return q.businessUnit;
}

export function proposalContent(q: Quote): UnitProposalContent {
  const unit = effectiveBusinessUnit(q);
  return unit ? CONTENT[unit] ?? GENERIC : GENERIC;
}

export function describeItem(item: QuoteItem): string {
  const d = item.description.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/panel|facp|central/, 'Central de control y supervisión'],
    [/detector|humo/, 'Detección temprana'],
    [/estaci[oó]n|manual|pulsador/, 'Activación manual y aviso'],
    [/sirena|estrobo|avisador/, 'Notificación audible y visual'],
    [/m[oó]dulo|control/, 'Supervisión de dispositivos'],
    [/bater[ií]a|ups|respaldo/, 'Respaldo de energía'],
    [/tuber[ií]a|emt|conduit/, 'Canalización y protección'],
    [/cable|fplr|utp|cat/, 'Cableado y conexión'],
    [/c[aá]mara|domo|bala|ip/, 'Captura de imagen'],
    [/nvr|dvr|grabador/, 'Grabación y almacenamiento'],
    [/switch|poe|router|red/, 'Conectividad de red'],
    [/rack|gabinete/, 'Organización física'],
    [/lector|credencial|tarjeta/, 'Control de acceso'],
    [/cerradura|electroim[aá]n|bot[oó]n/, 'Apertura y salida'],
    [/antena|eas|etiqueta|tag/, 'Protección antihurto'],
    [/gps|localizador|rastreador/, 'Localización'],
    [/instalaci|configuraci|puesta en marcha/, 'Instalación y puesta en marcha'],
  ];
  return rules.find(([re]) => re.test(d))?.[1] ?? 'Suministro e instalación';
}

export function fillTerms(text: string, q: Quote): string {
  return text
    .replace(/\{national\}/g, q.terms.deliveryNational || 'según disponibilidad')
    .replace(/\{import\}/g, q.terms.deliveryImport || 'según disponibilidad')
    .replace(/\{install\}/g, q.terms.installationTime || 'según alcance');
}
