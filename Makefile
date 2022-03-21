UGLIFY		= uglifyjs
SOURCES0	= js/GCA2DRenderer.js
SOURCES1	= js/GCA3DRenderer.js
LIBRARY0	= js/GCA2DRenderer.min.js
LIBRARY1	= js/GCA3DRenderer.min.js

all:		$(LIBRARY0) $(LIBRARY1)

$(LIBRARY0):	$(SOURCES0)
		$(UGLIFY) -c -- $(SOURCES0) >$(LIBRARY0)

$(LIBRARY1):	$(SOURCES1)
		$(UGLIFY) -c -- $(SOURCES1) >$(LIBRARY1)
