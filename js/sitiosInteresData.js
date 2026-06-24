/**
 * Enlaces del acervo estadístico y geográfico (INEGI y portales relacionados).
 * Fuente: Acervo estadístico y geográfico_Guerrero.pdf + ligas para carrusel.txt
 */

/** Portales destacados (carrusel superior). */
export const SITIOS_INTERES_DESTACADOS = [
  {
    title: "México en cifras",
    subtitle: "Resumen por entidad y municipio",
    url: "https://inegi.org.mx/app/areasgeograficas/default.aspx#collapse-Resumen",
    accent: "geo",
  },
  {
    title: "Banco de indicadores",
    subtitle: "Consulta interactiva INEGI",
    url: "https://inegi.org.mx/app/indicadores/",
    accent: "data",
  },
  {
    title: "Agenda 2030 México",
    subtitle: "Objetivos de desarrollo sostenible",
    url: "https://agenda2030.mx/#/home",
    accent: "ods",
  },
  {
    title: "CNI · SNIEG",
    subtitle: "Cumplimiento de normas de información",
    url: "https://www.snieg.mx/cni/",
    accent: "gov",
  },
  {
    title: "DENUE",
    subtitle: "Directorio de unidades económicas",
    url: "https://www.inegi.org.mx/app/mapa/denue/",
    accent: "eco",
  },
  {
    title: "Espacio y datos",
    subtitle: "Mapa interactivo INEGI",
    url: "https://www.inegi.org.mx/app/mapa/espacioydatos/",
    accent: "map",
  },
  {
    title: "Inventario Nacional de Viviendas",
    subtitle: "INV · consulta cartográfica",
    url: "https://www.inegi.org.mx/app/mapa/espacioydatos/?app=inv",
    accent: "viv",
  },
  {
    title: "Mapa digital",
    subtitle: "En línea y para escritorio",
    url: "https://www.inegi.org.mx/temas/mapadigital/",
    accent: "grid",
  },
];

/** Programas y productos por temática (rejilla). */
export const SITIOS_INTERES_GRUPOS = [
  {
    id: "socio",
    title: "Sociodemografía y hogares",
    items: [
      { title: "Censo de Población y Vivienda 2020", url: "https://inegi.org.mx/programas/ccpv/2020/" },
      { title: "Encuesta Nacional de Ocupación y Empleo", url: "https://www.inegi.org.mx/programas/enoe/15ymas/" },
      { title: "Museos", url: "https://inegi.org.mx/programas/museos/" },
      { title: "Relaciones Laborales de Jurisdicción Local", url: "https://inegi.org.mx/programas/rellaborales/" },
      { title: "Estadística de Divorcios (ED)", url: "https://inegi.org.mx/programas/ed/" },
      { title: "Estadística de Matrimonios (EMAT)", url: "https://inegi.org.mx/programas/emat/" },
      { title: "Estadísticas de Nacimientos Registrados (ENR)", url: "https://inegi.org.mx/programas/natalidad/" },
      { title: "Estadísticas de Defunciones Fetales (EDF)", url: "https://inegi.org.mx/programas/edf/" },
      { title: "Estadísticas de Defunciones Registradas (EDR)", url: "https://inegi.org.mx/programas/edr/" },
      {
        title: "Indicadores Laborales para los Municipios de México (ILMM)",
        url: "https://inegi.org.mx/programas/ilmm/",
      },
    ],
  },
  {
    id: "eco",
    title: "Economía y producción",
    items: [
      { title: "Conjuntura Económica", url: "https://inegi.org.mx/programas/ce/2024/" },
      {
        title: "Actualización del Marco Censal Agropecuario (AMCA)",
        url: "https://www.inegi.org.mx/programas/amca/2016/",
      },
      { title: "Censos Agropecuarios", url: "https://www.inegi.org.mx/programas/ca/2022/" },
      { title: "Estadísticas de accidentes de tránsito", url: "https://www.inegi.org.mx/programas/accidentes/" },
      { title: "Finanzas públicas estatales y municipales", url: "https://www.inegi.org.mx/programas/finanzas/" },
      { title: "Industria Minerometalúrgica", url: "https://www.inegi.org.mx/programas/indminero/" },
      { title: "IMMEX", url: "https://www.inegi.org.mx/programas/immex/" },
      { title: "Vehículos de Motor Registrados en Circulación (VMRC)", url: "https://www.inegi.org.mx/programas/vehiculosmotor/" },
      { title: "Índice Nacional de Precios al Consumidor", url: "https://www.inegi.org.mx/programas/inpc/2018a/" },
    ],
  },
  {
    id: "geo",
    title: "Geografía y medio ambiente",
    items: [
      { title: "Topografía escala 1:50 000", url: "https://www.inegi.org.mx/programas/topografia/50000/" },
      { title: "Geomediana", url: "https://www.inegi.org.mx/programas/geomediana/" },
      {
        title: "Índice de Clasificaciones de Agua Superficial desde el Espacio (ICASE)",
        url: "https://www.inegi.org.mx/programas/icase/",
      },
      { title: "Índice de vegetación (NDVI)", url: "https://www.inegi.org.mx/programas/NDVI/" },
    ],
  },
  {
    id: "gov",
    title: "Gobierno y seguridad",
    items: [
      {
        title: "Censo Nacional de Gobiernos Municipales y Demarcaciones",
        url: "https://www.inegi.org.mx/programas/cngmd/2023/",
      },
      {
        title: "Encuesta Nacional de Calidad e Impacto Gubernamental",
        url: "https://www.inegi.org.mx/programas/encig/2023/",
      },
      {
        title: "Encuesta Nacional de Victimización y Percepción sobre Seguridad",
        url: "https://www.inegi.org.mx/programas/envipe/2024/",
      },
    ],
  },
];
