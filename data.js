const people = [
  {
    name: "Dieter Rams",
    trade: "Industrial Designer",
    image: "images/dieter-rams.jpg",
    bio: "Dieter Rams spent decades at Braun defining what good design could be — functional, honest, and quiet. His ten principles, from 'as little design as possible' to 'good design is long-lasting', became a foundational text for generations of designers. His work didn't shout. It simply worked, beautifully. Apple's Jony Ive has cited him as a primary influence, but Rams himself remained skeptical of excess and ornament throughout his life. He believed design was a responsibility, not a profession.",
    works: [
      "images/works/dieter-rams/01-sk4.jpg",
      "images/works/dieter-rams/02-t3-radio.jpg",
      "images/works/dieter-rams/03-et66.jpg",
      "images/works/dieter-rams/04-vitsoe606.jpg",
      "images/works/dieter-rams/05-tp1.jpg",
      "images/works/dieter-rams/06-t1000.jpg",
      "images/works/dieter-rams/07-audio310.jpg",
      "images/works/dieter-rams/08-et66-dhub.jpg"
    ]
  },
  {
    name: "James Baldwin",
    trade: "Writer & Activist",
    image: "images/james-baldwin.jpg",
    bio: "James Baldwin wrote from the inside of American contradiction — Black, gay, brilliant, and unsparing. His essays cracked open race, identity, and love with a precision that still feels urgent. 'The Fire Next Time', 'Notes of a Native Son', 'Giovanni's Room' — each one a refusal to look away. He spent much of his life in exile in Paris, observing America from a distance that sharpened rather than dulled his clarity. He believed that the artist's job was to disturb the peace.",
    works: [
      "images/works/james-baldwin/01-fire-next-time.jpg",
      "images/works/james-baldwin/02-giovannis-room.jpg",
      "images/works/james-baldwin/03-notes-native-son.jpg",
      "images/works/james-baldwin/04-another-country.jpg",
      "images/works/james-baldwin/05-go-tell-it.jpg",
      "images/works/james-baldwin/06-beale-street.jpg",
      "images/works/james-baldwin/07-no-name-street.jpg",
      "images/works/james-baldwin/08-baldwin-brando.jpg"
    ]
  },
  {
    name: "Vera Molnár",
    trade: "Computer Artist",
    image: "images/vera-molnar.jpg",
    bio: "Vera Molnár began working with algorithms before computers were widely available, drawing systematic variations by hand. When she finally got access to a machine in 1968, she found the tool she'd been waiting for. Her work explores the tension between order and disruption — grids, lines, and squares pushed just far enough out of place to feel alive. Working well into her nineties, she remained one of the most rigorous and playful minds at the intersection of art and computation.",
    works: [
      "images/works/vera-molnar/01-interruptions.jpg",
      "images/works/vera-molnar/02-portrait-1996.jpg",
      "images/works/vera-molnar/03-pompidou-metal.jpg",
      "images/works/vera-molnar/04-pompidou-cahiers.jpg",
      "images/works/vera-molnar/05-pompidou-entree.jpg",
      "images/works/vera-molnar/06-portrait2.jpg"
    ]
  },
  {
    name: "Paul Rand",
    trade: "Graphic Designer",
    image: "images/paul-rand.jpg",
    bio: "Paul Rand brought European modernism into American commercial life and made it stick. His logos for IBM, ABC, and UPS weren't just marks — they were arguments about what design could do for an institution. He was opinionated to the point of abrasion, famously presenting clients with a single solution. His book 'Thoughts on Design' remains one of the clearest statements of what graphic design is actually for: not decoration, but the integration of form and meaning into something that communicates without effort.",
    works: [
      "images/works/paul-rand/01-ibm.jpg",
      "images/works/paul-rand/02-next.jpg",
      "images/works/paul-rand/03-abc.jpg",
      "images/works/paul-rand/04-ups.jpg",
      "images/works/paul-rand/05-westinghouse.jpg",
      "images/works/paul-rand/06-eye-bee-m.jpg",
      "images/works/paul-rand/07-thoughts-design.jpg",
      "images/works/paul-rand/08-portrait.jpg"
    ]
  },
  {
    name: "Toni Morrison",
    trade: "Novelist",
    image: "images/toni-morrison.jpg",
    bio: "Toni Morrison wrote the stories that American literature had been avoiding. 'Beloved', 'Song of Solomon', 'The Bluest Eye' — novels built from the interior of Black American experience, rendered in language that was both lyrical and exacting. She won the Nobel Prize in 1993, but her real achievement was structural: she expanded what the novel was capable of holding. She edited at Random House for years while writing, championing other Black writers. She never softened her work for a white gaze.",
    works: [
      "images/works/toni-morrison/01-beloved.jpg",
      "images/works/toni-morrison/02-song-of-solomon.jpg",
      "images/works/toni-morrison/03-bluest-eye.jpg",
      "images/works/toni-morrison/04-sula.jpg",
      "images/works/toni-morrison/05-jazz.jpg",
      "images/works/toni-morrison/06-paradise.jpg",
      "images/works/toni-morrison/07-home.jpg",
      "images/works/toni-morrison/08-tar-baby.jpg"
    ]
  },
  {
    name: "Buckminster Fuller",
    trade: "Architect & Futurist",
    image: "images/buckminster-fuller.jpg",
    bio: "Buckminster Fuller thought in systems. The geodesic dome, the Dymaxion car, 'Spaceship Earth' — his ideas were often impractical but always pointed toward something real: that design could be a tool for solving humanity's largest problems. He called himself a 'comprehensive anticipatory design scientist' and meant it. He influenced everyone from the counterculture to Silicon Valley, less for specific inventions than for the conviction that if you understood how things worked, you could make them work better for everyone.",
    works: [
      "images/works/buckminster-fuller/01-tensegrity.jpg",
      "images/works/buckminster-fuller/02-vitra-dome.jpg",
      "images/works/buckminster-fuller/03-carbondale-dome.jpg",
      "images/works/buckminster-fuller/04-dome-home.jpg",
      "images/works/buckminster-fuller/05-dymaxion-car.jpg",
      "images/works/buckminster-fuller/06-dymaxion-house.jpg",
      "images/works/buckminster-fuller/07-biosphere.jpg",
      "images/works/buckminster-fuller/08-expo67.jpg"
    ]
  },
  {
    name: "Carby Tuckwell",
    trade: "Creative Director",
    image: "images/carby-tuckwell.jpg",
    bio: "Carby Tuckwell is the creative force behind Deus Ex Machina, the Australian brand that blurred the line between surf culture, custom motorcycles, and art. As Creative Director, he shaped a world rather than a product range — building a community around craft, travel, and making things by hand. His approach is anti-corporate and deeply personal, drawing from subculture rather than trend forecasting. He has helped establish Deus as one of the few lifestyle brands with genuine creative credibility across multiple disciplines.",
    works: [
      "images/works/carby-tuckwell/01-carby-icon.jpg",
      "images/works/carby-tuckwell/02-carby-portrait.jpg",
      "images/works/carby-tuckwell/03-deus-biarritz.jpg",
      "images/works/carby-tuckwell/04-carby-yak1.jpg",
      "images/works/carby-tuckwell/05-carby-yak2.jpg",
      "images/works/carby-tuckwell/06-mini-deus-1.jpg",
      "images/works/carby-tuckwell/07-mini-deus-2.jpg",
      "images/works/carby-tuckwell/08-mini-skeg.jpg"
    ]
  },
  {
    name: "Tobias van Schneider",
    trade: "Designer",
    image: "images/tobias-van-schneider.jpg",
    bio: "Tobias van Schneider is a German-Austrian designer who built a reputation for work that feels considered and a little strange — in the best way. He led design at Spotify during some of its most formative years, helping shape the visual language of a product used by hundreds of millions. He later founded his own studio and created DESK, a newsletter about the inner life of creative work. His writing is as influential as his visual output, consistently honest about doubt, process, and the unglamorous reality of making things.",
    works: [
      "images/works/tobias-van-schneider/01-mars-rocket.jpg",
      "images/works/tobias-van-schneider/02-mars-rover.jpg",
      "images/works/tobias-van-schneider/03-mars-abstract.jpg",
      "images/works/tobias-van-schneider/04-mars-badge.jpg",
      "images/works/tobias-van-schneider/05-mars-logo.jpg",
      "images/works/tobias-van-schneider/06-hovs-nyc.jpg",
      "images/works/tobias-van-schneider/07-hovs-angels.jpg",
      "images/works/tobias-van-schneider/08-hovs-artifact.jpg"
    ]
  }
  ,
  {
    name: "Jack Fisk",
    trade: "Production Designer",
    image: "images/jack-fisk.jpg",
    bio: "Jack Fisk is one of the great unsung collaborators in American cinema. Working across five decades, he built the visual worlds for Terrence Malick's most luminous films — 'Badlands', 'Days of Heaven', 'The Thin Red Line', 'The Tree of Life' — as well as Paul Thomas Anderson's 'There Will Be Blood' and 'The Master'. His sets don't look designed; they look inhabited. He is married to Sissy Spacek, whose early films he also shaped. His work operates in the background of greatness, which is exactly where the best production design lives.",
    works: [
      "images/works/jack-fisk/01-days-of-heaven-magic.jpg",
      "images/works/jack-fisk/02-days-of-heaven.jpg",
      "images/works/jack-fisk/03-malick.jpg",
      "images/works/jack-fisk/04-there-will-be-blood.jpg",
      "images/works/jack-fisk/05-mulholland.jpg",
      "images/works/jack-fisk/06-carrie.jpg"
    ]
  },
  {
    name: "Susan Kare",
    trade: "Graphic Designer",
    image: "images/susan-kare.jpg",
    bio: "Susan Kare designed the visual language of the personal computer. Her icons for the original Macintosh — the trash can, the happy Mac, the bomb, the hand cursor — gave a machine a face and made it approachable for the first time. She also created the Chicago and Geneva typefaces, and designed the icons for Windows 3.0 Solitaire, arguably the most-seen card design in history. Her work was pixel art before the term existed, and it endures because it was always rooted in clarity and wit rather than decoration.",
    works: [
      "images/works/susan-kare/01-happy-mac.jpg",
      "images/works/susan-kare/02-chicago-font.jpg",
      "images/works/susan-kare/03-bomb.jpg",
      "images/works/susan-kare/04-sad-mac.jpg",
      "images/works/susan-kare/05-macintosh-128k.jpg",
      "images/works/susan-kare/06-next-logo.jpg",
      "images/works/susan-kare/07-steve-jobs-mac.jpg",
      "images/works/susan-kare/08-chicago-ec.jpg"
    ]
  }
];
