import Image from "next/image";
import type { FC } from "react";

const testimonials = [
  {
    quote:
      "Lorem ipsum dolor sit amet consectetur. Cursus diam malesuada molestie egestas. Viverra sit viverra ipsum eget imperdiet.",
    author: "John Doe",
    role: "Crypto Blogger",
    avatar: "/assets/homepage/testimonial-1.png"
  },
  {
    quote:
      "Lorem ipsum dolor sit amet consectetur. Cursus diam malesuada molestie egestas. Viverra sit viverra ipsum eget imperdiet.",
    author: "John Doe",
    role: "Crypto Blogger",
    avatar: "/assets/homepage/testimonial-2.png"
  },
  {
    quote:
      "Lorem ipsum dolor sit amet consectetur. Cursus diam malesuada molestie egestas. Viverra sit viverra ipsum eget imperdiet.",
    author: "John Doe",
    role: "Crypto Blogger",
    avatar: "/assets/homepage/testimonial-3.png"
  }
];

export const TestimonialsSection: FC = () => {
  return (
    <section className="py-16 px-6 md:px-10 max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-2 gap-10 items-start">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full px-6 py-2 bg-neutral-900/60">
            <img src="/assets/homepage/section-testimonials-icon.svg" alt="Testimonials icon" className="h-5 w-5" />
            <span className="text-green-500/70 font-semibold text-xs tracking-wider">TESTIMONIALS</span>
            <Image src="/assets/homepage/section-features-divider.png" alt="Divider" width={48} height={12} className="opacity-80" />
          </div>
          <div className="mt-6">
            <h3 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Trusted by Crypto Natives Worldwide
            </h3>
            <p className="mt-3 text-white/70 max-w-md">
              Thousands of crypto investors rely on Lemon Markets to leverage their assets with confidence and clarity.
            </p>
            <a
              href="/trending"
              className="mt-6 inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold bg-gradient-to-r from-lime-600 via-lime-700 to-green-950 text-gray-100 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
            >
              Get Started
            </a>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {testimonials.map((t, i) => (
            <div key={i} className="rounded-2xl bg-neutral-900/60 p-6 border border-white/10">
              <p className="text-white/80">“{t.quote}”</p>
              <div className="mt-4 flex items-center gap-3">
                <Image src={t.avatar} alt={t.author} width={40} height={40} className="rounded-full" />
                <div>
                  <p className="text-white font-semibold text-sm">{t.author}</p>
                  <p className="text-white/60 text-xs">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
