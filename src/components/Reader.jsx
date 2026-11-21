export default function Reader({ article, ref }) {
  return (
    <main className="mx-auto max-w-2xl px-5 pt-10 pb-40 sm:px-6 sm:pt-20 sm:pb-32">
      <p className="text-xs font-medium tracking-widest text-stone-400 uppercase">{article.meta}</p>
      <h1 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl font-semibold tracking-tight text-stone-900">
        {article.title}
      </h1>

      <article ref={ref} className="mt-10 space-y-6 font-serif text-[1.1875rem] leading-[1.8] text-stone-800">
        {article.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </article>
    </main>
  )
}

