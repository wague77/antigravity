/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permet de servir les images depuis Unsplash et autres domaines externes
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  // Alias @ → src/ (complémentaire au jsconfig.json)
  experimental: {
    // Activer les Server Actions si besoin dans le futur
  },
};

module.exports = nextConfig;
